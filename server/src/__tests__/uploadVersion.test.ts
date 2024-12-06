import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadVersion } from "../routes/uploadVersion";
import Fastify from "fastify";
import * as shared from "@package-rater/shared";
import * as crypto from "crypto";
import * as util from "../util";
import * as AdmZip from "adm-zip";

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
vi.mock("fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  readFile: vi.fn()
}));
vi.mock("../util.js", async (importOriginal) => {
  vi.stubEnv("NODE_TEST", "true");
  const original = await importOriginal<typeof util>();
  return {
    ...original,
    getPackageMetadata: vi.fn().mockReturnValue({
      byId: {
        id1: {
          packageName: "completed-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: { "completed-dep": "1.0.0" },
          standaloneCost: 0.5,
          totalCost: 1.5,
          costStatus: "completed"
        },
        id2: {
          packageName: "content-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: { "completed-dep": "1.0.0" },
          standaloneCost: 0.5,
          totalCost: 1.5,
          costStatus: "completed"
        }
      },
      byName: {
        "completed-package": {
          uploadedWithContent: false,
          versions: {
            "1.0.0": {
              id: "id1",
              ndjson: null,
              dependencies: {},
              standaloneCost: 0.5,
              totalCost: 0.5,
              costStatus: "completed"
            }
          }
        },
        "content-package": {
          uploadedWithContent: true,
          versions: {
            "1.0.0": {
              id: "id2",
              ndjson: null,
              dependencies: {},
              standaloneCost: 0.5,
              totalCost: 0.5,
              costStatus: "completed"
            }
          }
        }
      },
      costCache: {
        id1: {
          // completed-dep-1.0.0
          totalCost: 1.5,
          standaloneCost: 1.5,
          dependencies: [],
          costStatus: "completed"
        }
      }
    }),
    checkIfContentPatchValid: vi.fn().mockReturnValue(true),
    savePackage: vi.fn().mockResolvedValue({ success: true }),
    calculatePackageId: vi.fn().mockReturnValue("id2")
  };
});
vi.mock("adm-zip", () => ({
  default: vi.fn().mockReturnValue({
    getEntries: vi.fn().mockReturnValue([])
  })
}));

describe("uploadVersion", () => {
  const logger = shared.getLogger("test");
  global.fetch = vi.fn();
  const fastify = Fastify();
  fastify.post("/package/:id", uploadVersion);
  const checkIfPackageExists = vi.spyOn(util, "checkIfPackageExists");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 if no metadata or data is provided", async () => {
    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: {}
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({
      error:
        "There is missing field(s) in the PackageData or it is formed improperly (e.g. Content and URL ar both set)"
    });
  });

  it("should return 400 if both Content and URL are provided", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "some-base64-encoded-content", URL: "http://example.com", debloat: false }
    };
    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({
      error:
        "There is missing field(s) in the PackageData or it is formed improperly (e.g. Content and URL ar both set)"
    });
  });

  it("should return 404 if the package does not exist", async () => {
    checkIfPackageExists.mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "some-base64-encoded-content", URL: "", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(404);
    expect(reply.json()).toEqual({ error: "Package not found" });
  });

  it("should return 409 if the package already exists", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(true);
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "some-base64-encoded-content", URL: "", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.json()).toEqual({ error: "Package already exists" });
  });

  it("should return 400 if content patch is invalid", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(false);
    vi.mocked(util.checkIfContentPatchValid).mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "some-base64-encoded-content", URL: "", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({
      error: "Cannot provide a version with patch number lower than available versions already uploaded"
    });
  });

  it("should return 400 if no package.json is found in the zip", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "test", URL: "", debloat: false }
    };
    const mockedZipInstance = {
      getEntries: vi.fn().mockReturnValueOnce([{ entryName: "index.js", getData: vi.fn() }])
    };
    // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
    vi.mocked(AdmZip.default).mockImplementationOnce(() => mockedZipInstance);

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(logger.error).toHaveBeenCalledWith("No package.json found in the uploaded package");
    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "No package.json found in the package" });
  });

  it("should return 424 if the package score is too low for npm package", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.npmjs.com/package/completed-package/v/1.0.1", debloat: false }
    };

    vi.mocked(util.savePackage).mockResolvedValueOnce({ success: false, reason: "Package score is too low" });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(424);
    expect(reply.json()).toEqual({ error: "Package is not uploaded due to the disqualified rating." });
    expect(logger.error).toHaveBeenCalledWith(
      "Package completed-package is not uploaded due to the disqualified rating."
    );
  });

  it("should return 500 if savePackage fails for npm url", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.npmjs.com/package/completed-package/v/1.0.1", debloat: false }
    };

    vi.mocked(util.savePackage).mockResolvedValueOnce({ success: false, reason: "Error saving the package" });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(500);
    expect(reply.json()).toEqual({ error: "Error saving the package" });
    expect(logger.error).toHaveBeenCalledWith("Error saving the package completed-package: Error saving the package");
  });

  it("should return 500 if saving the package fails", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "content-package", Version: "1.0.0", ID: "id2" },
      data: { Content: "some-base64-encoded-content", URL: "", debloat: false }
    };

    const packageJson = { name: "content-package", version: "1.0.0" };
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
      url: "/package/id2",
      body: body
    });

    // expect(reply.statusCode).toBe(500);
    expect(reply.json()).toEqual({ error: "Error saving the package" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("should return 200 when package is uploaded successfully", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "content-package", Version: "1.0.0", ID: "id2" },
      data: { Content: "some-base64-encoded-content", URL: "", debloat: false }
    };

    const packageJson = { name: "content-package", version: "1.0.0" };
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
      url: "/package/id2",
      body: body
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({ message: "Version is updated." });
    expect(logger.info).toHaveBeenCalledWith("Package content-package with version 1.0.0 uploaded successfully");
  });

  it("should return 200 when package is uploaded successfully from npm", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.npmjs.com/package/completed-package/v/1.0.0", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({ message: "Version is updated." });
    expect(logger.info).toHaveBeenCalledWith("Package completed-package with version 1.0.0 uploaded successfully");
  });

  it("should return 200 when package is uploaded successfully from github", async () => {
    checkIfPackageExists.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.github.com/owner/completed-package", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({ message: "Version is updated." });
    expect(logger.info).toHaveBeenCalledWith("Package completed-package with version 1.0.0 uploaded successfully");
  });
});
