import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { savePackage, checkIfPackageExists, getPackageMetadata } from "../util";
import * as shared from "@package-rater/shared";
import * as s3Client from "@aws-sdk/client-s3";
import * as tar from "tar";
import * as util from "util";

vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(mockMetadataJson))),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  cp: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("fs", () => ({
  createWriteStream: vi.fn()
}));
vi.mock("child_process", () => ({
  exec: vi.fn()
}));
vi.mock("stream/promises", () => ({
  pipeline: vi.fn()
}));
vi.mock("tar", async (importOriginal) => {
  const original = await importOriginal<typeof tar>();
  return {
    ...original,
    create: vi.fn()
  };
});
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const original = await importOriginal<typeof s3Client>();
  return {
    ...original,
    S3Client: vi.fn(() => ({
      send: vi.fn()
    })),
    PutObjectCommand: vi.fn()
  };
});
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
vi.mock("util", () => ({
  promisify: vi.fn().mockReturnValue(async () => {
    return Promise.resolve({
      stdout: JSON.stringify({ NetScore: 0.8 }),
      stderr: null
    });
  })
}));

const mockMetadataJson = {
  byId: {
    "existing-ID": {
      Name: "existing-package",
      Version: "1.0.0",
      ndjson: "ndjson"
    }
  },
  byName: {
    express: {
      "1.0.0": {
        id: "express-id",
        ndjson: "ndjson"
      }
    }
  }
};

describe("savePackage", () => {
  const tarSpy = vi.spyOn(tar, "create");
  const logger = shared.getLogger("test");
  global.fetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should save a package from file path and upload to S3 in prod", async () => {
    vi.stubEnv("NODE_ENV", "prod");
    const packageFilePath = "/path/to/package-file";

    const result = await savePackage("test-package", "1.0.0", "new-package-id", packageFilePath, undefined);

    expect(result.success).toBe(true);
    expect(tarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        gzip: true,
        file: expect.any(String),
        cwd: expect.any(String)
      }),
      ["."]
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Uploaded package test-package to S3: test-package/new-package-id/test-package.tgz"
    );
    expect(logger.info).toHaveBeenCalledWith("Saved package test-package v1.0.0 with ID new-package-id");
  });

  it("should save a package from URL and upload to S3 in prod", async () => {
    vi.stubEnv("CLI_API_URL", "https://test-api.com");
    const url = "https://www.npmjs.com/package/test-package2";
    (global.fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, result: { NetScore: 0.8 } })
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream()
      });

    const result = await savePackage("test-package2", "1.0.0", "new-package-id", undefined, url);
    expect(result.success).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      "Uploaded package test-package2 to S3: test-package2/new-package-id/test-package2.tgz"
    );
    expect(logger.info).toHaveBeenCalledWith("Saved package test-package2 v1.0.0 with ID new-package-id");
  });

  it("should return an error if package score is too low", async () => {
    vi.stubEnv("NODE_ENV", "dev");
    const mockExec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ NetScore: 0.4 }), stderr: null });
    vi.spyOn(util, "promisify").mockReturnValueOnce(mockExec);

    const result = await savePackage(
      "test-package",
      "1.0.0",
      "new-package-id",
      undefined,
      "https://www.npmjs.com/package/test-package"
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Package score is too low");
  });

  it("should return an error if both file path and URL are provided", async () => {
    const result = await savePackage(
      "test-package",
      "1.0.0",
      "new-package-id",
      "/path/to/package-file",
      "https://www.npmjs.com/package/test-package"
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Provide either package file path or URL, not both");
  });

  it("should return an error if neither file path nor URL is provided", async () => {
    const result = await savePackage("test-package", "1.0.0", "new-package-id");

    expect(result.success).toBe(false);
    expect(result.reason).toBe("No package file path or URL provided");
  });
});

describe("checkIfPackageExists", () => {
  it("should return true if package exists", async () => {
    const result = await checkIfPackageExists("existing-ID");

    expect(result).toBe(true);
  });

  it("should return false if package does not exist", async () => {
    const result = await checkIfPackageExists("non-existing-ID");

    expect(result).toBe(false);
  });
});

describe("getPackageMetadata", () => {
  it("should return package metadata if package exists", async () => {
    const result = await getPackageMetadata("express");

    expect(result).toEqual(mockMetadataJson.byName["express"]);
  });

  it("should return null if package does not exist", async () => {
    const result = await getPackageMetadata("non-existing-package-id");

    expect(result).toBeNull();
  });
});
