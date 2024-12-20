import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { uploadPackage } from "../routes/uploadPackage";
import Fastify from "fastify";
import * as shared from "@package-rater/shared";
import * as AdmZip from "adm-zip";
import * as crypto from "crypto";
import * as util from "../util";

vi.mock("@package-rater/shared", async (importOriginal) => {
  const original = await importOriginal<typeof shared>();
  return {
    ...original,
    getLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    }),
    cloneRepo: vi.fn().mockResolvedValue("repoDir")
  };
});
vi.mock("crypto", async (importOriginal) => {
  const original = await importOriginal<typeof crypto>();
  return {
    ...original,
    createHash: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue("mocked-hash-id")
    })
  };
});
vi.mock("../util.js", async (importOriginal) => {
  vi.stubEnv("NODE_TEST", "true");
  const original = await importOriginal<typeof util>();
  return {
    ...original,
    checkIfPackageExists: vi.fn().mockReturnValue(false),
    savePackage: vi.fn().mockResolvedValue({ success: true }),
    calculatePackageId: vi.fn().mockReturnValue("mocked-hash-id")
  };
});
vi.mock("fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  readFile: vi.fn()
}));
vi.mock("adm-zip", () => ({
  default: vi.fn().mockReturnValue({
    getEntries: vi.fn().mockReturnValue([])
  })
}));

describe("uploadPackage", () => {
  const logger = shared.getLogger("test");
  global.fetch = vi.fn();
  const fastify = Fastify();
  fastify.post("/package", uploadPackage);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 if both Content and URL are provided", async () => {
    const body = { Content: "some-base64-encoded-content", URL: "http://example.com", debloat: false };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({
      error:
        "There is missing field(s) in the PackageData or it is formed improperly (e.g. Content and URL ar both set)"
    });
  });

  it("should return 400 if no package.json is found in the zip", async () => {
    const body = { Content: "some-base64-encoded-content", URL: "", debloat: false };
    const mockedZipInstance = {
      getEntries: vi.fn().mockReturnValueOnce([{ entryName: "index.js", getData: vi.fn() }])
    };
    // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
    vi.mocked(AdmZip.default).mockImplementationOnce(() => mockedZipInstance);

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(logger.error).toHaveBeenCalledWith("No package.json found in the uploaded package");
    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "No package.json found in the package" });
  });

  it("should return 400 for an invalid npm URL", async () => {
    const body = { Content: "", URL: "http://npmjs.com", debloat: false };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "Invalid npm URL" });
    expect(logger.error).toHaveBeenCalledWith("Invalid npm URL: http://npmjs.com");
  });

  it("should return 400 for an invalid npm package name", async () => {
    const body = { Content: "", URL: "https://www.npmjs.com/package/invalid-package", debloat: false };

    (global.fetch as Mock).mockRejectedValueOnce({
      json: vi.fn().mockResolvedValue({ error: "Not found" }),
      ok: false
    });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "Invalid npm package name" });
    expect(logger.error).toHaveBeenCalledWith("Invalid npm package name: invalid-package");
  });

  it("should return 400 if github URL is invalid", async () => {
    const body = { Content: "", URL: "https://github.com", debloat: false };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "Invalid Github URL" });
    expect(logger.error).toHaveBeenCalledWith("Invalid Github URL: https://github.com");
  });

  it("should return 409 if the package already exists", async () => {
    const body = { Content: "some-base64-encoded-content", URL: "", debloat: false };
    const packageJson = { name: "test-package", version: "1.0.0" };
    const mockedZipInstance = {
      getEntries: vi
        .fn()
        .mockReturnValueOnce([
          { entryName: "package.json", getData: vi.fn().mockReturnValue(Buffer.from(JSON.stringify(packageJson))) }
        ])
    };
    // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
    vi.mocked(AdmZip.default).mockImplementationOnce(() => mockedZipInstance);
    vi.mocked(util.checkIfPackageExists).mockReturnValueOnce(true);

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.json()).toEqual({ error: "Package already exists" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("should return 409 if the npm package already exists", async () => {
    const body = { Content: "", URL: "https://www.npmjs.com/package/test-package/v/1.0.0", debloat: false };
    vi.mocked(util.checkIfPackageExists).mockReturnValueOnce(true);

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.json()).toEqual({ error: "Package already exists" });
    expect(logger.error).toHaveBeenCalledWith(
      "Package test-package with version 1.0.0 already exists, use the update route"
    );
  });

  it("should return 424 if the package score is too low for npm package", async () => {
    const body = { Content: "", URL: "https://www.npmjs.com/package/test-package/v/1.0.0", debloat: false };

    vi.mocked(util.savePackage).mockResolvedValueOnce({ success: false, reason: "Package score is too low" });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(424);
    expect(reply.json()).toEqual({ error: "Package is not uploaded due to the disqualified rating." });
    expect(logger.error).toHaveBeenCalledWith("Package test-package is not uploaded due to the disqualified rating.");
  });

  it("should return 500 if savePackage fails for npc url", async () => {
    const body = { Content: "", URL: "https://www.npmjs.com/package/test-package/v/1.0.0", debloat: false };

    vi.mocked(util.savePackage).mockResolvedValueOnce({ success: false, reason: "Error saving the package" });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(500);
    expect(reply.json()).toEqual({ error: "Error saving the package" });
    expect(logger.error).toHaveBeenCalledWith("Error saving the package test-package: Error saving the package");
  });

  it("should return 500 if saving the package fails", async () => {
    const body = { Content: "some-base64-encoded-content", URL: "", debloat: false };

    const packageJson = { name: "test-package", version: "1.0.0" };
    const mockedZipInstance = {
      getEntries: vi
        .fn()
        .mockReturnValueOnce([
          { entryName: "package.json", getData: vi.fn().mockReturnValue(Buffer.from(JSON.stringify(packageJson))) }
        ])
    };
    // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
    vi.mocked(AdmZip.default).mockImplementationOnce(() => mockedZipInstance);
    vi.mocked(util.savePackage).mockResolvedValueOnce({ success: false, reason: "Error saving the package" });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(500);
    expect(reply.json()).toEqual({ error: "Error saving the package" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("should return 201 when package is uploaded successfully", async () => {
    const body = { Content: "some-base64-encoded-content", URL: "", debloat: false };

    const packageJson = { name: "test-package", version: "1.0.0" };
    const mockedZipInstance = {
      getEntries: vi
        .fn()
        .mockReturnValueOnce([
          { entryName: "package.json", getData: vi.fn().mockReturnValue(Buffer.from(JSON.stringify(packageJson))) }
        ])
    };
    // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
    vi.mocked(AdmZip.default).mockImplementationOnce(() => mockedZipInstance);

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toEqual({
      data: { Content: "some-base64-encoded-content" },
      metadata: { Name: "test-package", Version: "1.0.0", ID: "mocked-hash-id" }
    });
    expect(logger.info).toHaveBeenCalledWith("Package test-package with version 1.0.0 uploaded successfully");
  });

  it("should return 201 when package is uploaded successfully from npm", async () => {
    const body = { Content: "", URL: "https://www.npmjs.com/package/test-package/v/1.0.0", debloat: false };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toEqual({
      metadata: { Name: "test-package", Version: "1.0.0", ID: "mocked-hash-id" },
      data: { URL: "https://www.npmjs.com/package/test-package/v/1.0.0" }
    });
    expect(logger.info).toHaveBeenCalledWith("Package test-package with version 1.0.0 uploaded successfully");
  });

  it("should return 201 when package is uploaded successfully from github", async () => {
    const body = { Content: "", URL: "https://www.github.com/owner/repo", debloat: false };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package",
      body: body
    });

    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toEqual({
      metadata: { Name: "repo", Version: "1.0.0", ID: "mocked-hash-id" },
      data: { URL: "https://www.github.com/owner/repo" }
    });
    expect(logger.info).toHaveBeenCalledWith("Package repo with version 1.0.0 uploaded successfully");
  });
});
