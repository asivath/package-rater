import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { uploadVersion } from "../routes/uploadVersion";
import Fastify from "fastify";
import * as shared from "@package-rater/shared";
import * as unzipper from "unzipper";
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
    checkIfPackageVersionExists: vi.fn().mockReturnValue(false),
    checkIfContentPatchValid: vi.fn().mockReturnValue(true),
    savePackage: vi.fn().mockResolvedValue({ success: true }),
    calculatePackageId: vi.fn().mockReturnValue("id2")
  };
});

describe("uploadVersion", () => {
  const logger = shared.getLogger("test");
  global.fetch = vi.fn();
  const zipperSpy = vi.spyOn(unzipper.Open, "buffer");
  const zipperProperties = {
    signature: 0,
    diskNumber: 0,
    diskStart: 0,
    numberOfRecordsOnDisk: 0,
    centralDirectorySize: 0,
    centralDirectoryOffset: 0,
    commentLength: 0,
    numberOfRecords: 0,
    sizeOfCentralDirectory: 0,
    offsetToStartOfCentralDirectory: 0,
    extract: vi.fn()
  };
  const fileProperties = {
    path: "package.json",
    buffer: vi.fn(),
    type: "File" as const,
    signature: 0,
    versionMadeBy: 0,
    versionNeededToExtract: 0,
    flags: 0,
    compressionMethod: 0,
    lastModifiedTime: 0,
    crc32: 0,
    compressedSize: 0,
    uncompressedSize: 0,
    fileNameLength: 0,
    extraFieldLength: 0,
    fileCommentLength: 0,
    diskNumberStart: 0,
    internalFileAttributes: 0,
    externalFileAttributes: 0,
    relativeOffsetOfLocalHeader: 0,
    versionsNeededToExtract: 0,
    lastModifiedDate: 0,
    lastModifiedDateTime: new Date(),
    diskNumber: 0,
    isDirectory: vi.fn(),
    openReadStream: vi.fn(),
    offsetToLocalFileHeader: 0,
    pathBuffer: Buffer.from(""),
    isUnicode: 0,
    extra: Buffer.from(""),
    comment: "",
    stream: vi.fn()
  };
  const fastify = Fastify();
  fastify.post("/package/:id", uploadVersion);

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should return 400 if no package.json is found in the zip", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "test", URL: "", debloat: false }
    };
    const files = {
      files: [
        { ...fileProperties, path: "README.md" },
        { ...fileProperties, path: "src/index.js" }
      ]
    };
    zipperSpy.mockResolvedValueOnce({ ...files, ...zipperProperties });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(logger.error).toHaveBeenCalledWith("No package.json found in ");
    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "No package.json found in the package" });
  });

  it("should return 400 for an invalid npm URL", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "http://npmjs.com", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "Invalid npm URL" });
    expect(logger.error).toHaveBeenCalledWith("Invalid npm URL: http://npmjs.com");
  });

  it("should return 400 for an invalid npm package name", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.npmjs.com/package/invalid-package", debloat: false }
    };

    (global.fetch as Mock).mockRejectedValueOnce({
      json: vi.fn().mockResolvedValue({ error: "Not found" }),
      ok: false
    });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "Invalid npm package name" });
    expect(logger.error).toHaveBeenCalledWith("Invalid npm package name: invalid-package");
  });

  it("should return 400 if github URL is invalid", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://github.com", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({ error: "Invalid Github URL" });
    expect(logger.error).toHaveBeenCalledWith("Invalid Github URL: https://github.com");
  });

  it("should return 409 if the package already exists", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "some-base64-encoded-content", URL: "", debloat: false }
    };

    const packageJson = { name: "completed-package", version: "1.0.0" };
    const files = {
      files: [
        {
          ...fileProperties,
          path: "package.json",
          buffer: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(packageJson)))
        }
      ]
    };
    zipperSpy.mockResolvedValueOnce({ ...files, ...zipperProperties });

    // vi.mocked(util.checkIfPackageVersionExists).mockReturnValueOnce(true);
    vi.mocked(util.checkIfPackageVersionExists).mockReturnValueOnce(true);

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.json()).toEqual({ error: "Package already exists" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("should return 409 if the npm package already exists", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.npmjs.com/package/completed-package/v/1.0.0", debloat: false }
    };

    vi.mocked(util.checkIfPackageVersionExists).mockReturnValueOnce(true);

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(409);
    expect(reply.json()).toEqual({ error: "Package already exists" });
    expect(logger.error).toHaveBeenCalledWith("Package completed-package with version 1.0.0 already exists");
  });

  it("should fetch package details from npm registry if no version is provided", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.npmjs.com/package/completed-package", debloat: false }
    };
    vi.mocked(util.checkIfPackageVersionExists).mockReturnValueOnce(false);

    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        name: "completed-package",
        "dist-tags": { latest: "1.0.1" },
        versions: { "1.0.1": { name: "completed-package", version: "1.0.1" } }
      })
    });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    // expect(reply.statusCode).toBe(201);
    expect(reply.json()).toEqual({
      metadata: { Name: "completed-package", Version: "1.0.1", ID: "id2" },
      data: body
    });
    expect(logger.info).toHaveBeenCalledWith("Package completed-package with version 1.0.1 uploaded successfully");
  });

  it("should return 424 if the package score is too low for npm package", async () => {
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

  it("should return 500 if savePackage fails for npc url", async () => {
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
    const body = {
      metadata: { Name: "content-package", Version: "1.0.0", ID: "id2" },
      data: { Content: "some-base64-encoded-content", URL: "", debloat: false }
    };

    const packageJson = { name: "content-package", version: "1.0.1" };
    const files = {
      files: [
        {
          ...fileProperties,
          path: "package.json",
          buffer: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(packageJson)))
        },
        { ...fileProperties, path: "index.js", buffer: vi.fn() }
      ]
    };
    zipperSpy.mockResolvedValueOnce({ ...files, ...zipperProperties });
    vi.mocked(util.savePackage).mockResolvedValueOnce({ success: false, reason: "Error saving the package" });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id2",
      body: body
    });

    expect(reply.statusCode).toBe(500);
    expect(reply.json()).toEqual({ error: "Error saving the package" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("should return 201 when package is uploaded successfully", async () => {
    const body = {
      metadata: { Name: "content-package", Version: "1.0.0", ID: "id2" },
      data: { Content: "some-base64-encoded-content", URL: "", debloat: false }
    };

    const packageJson = { name: "content-package", version: "1.0.1" };
    const files = {
      files: [
        {
          ...fileProperties,
          path: "package.json",
          buffer: vi.fn().mockResolvedValue(Buffer.from(JSON.stringify(packageJson)))
        },
        { ...fileProperties, path: "index.js" }
      ]
    };
    zipperSpy.mockResolvedValueOnce({ ...files, ...zipperProperties });

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id2",
      body: body
    });

    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toEqual({
      data: body,
      metadata: { Name: "content-package", Version: "1.0.1", ID: "id2" }
    });
    expect(logger.info).toHaveBeenCalledWith("Package content-package with version 1.0.1 uploaded successfully");
  });

  it("should return 201 when package is uploaded successfully from npm", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.npmjs.com/package/completed-package/v/1.0.0", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toEqual({
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id2" },
      data: body
    });
    expect(logger.info).toHaveBeenCalledWith("Package completed-package with version 1.0.0 uploaded successfully");
  });

  it("should return 201 when package is uploaded successfully from github", async () => {
    const body = {
      metadata: { Name: "completed-package", Version: "1.0.0", ID: "id1" },
      data: { Content: "", URL: "https://www.github.com/owner/completed-package", debloat: false }
    };

    const reply = await fastify.inject({
      method: "POST",
      url: "/package/id1",
      body: body
    });

    expect(reply.statusCode).toBe(201);
    expect(reply.json()).toEqual({ metadata: { Name: "completed-package", Version: "1.0.0", ID: "id2" }, data: body });
    expect(logger.info).toHaveBeenCalledWith("Package completed-package with version 1.0.0 uploaded successfully");
  });
});
