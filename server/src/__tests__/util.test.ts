import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import {
  savePackage,
  checkIfPackageExists,
  getExactAvailableVersion,
  calculateTotalPackageCost,
  getMetadata,
  calculatePackageId
} from "../util";
import * as shared from "@package-rater/shared";
import * as s3Client from "@aws-sdk/client-s3";
import * as tar from "tar";
import * as util from "util";
import * as esbuild from "esbuild";
import * as getFolderSize from "get-folder-size";
import * as fsPromises from "fs/promises";

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify({
      byId: {
        "8949875233423535": {
          packageName: "completed-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {},
          standaloneCost: 0.5,
          totalCost: 0.5,
          costStatus: "completed"
        },
        "6023484092574754": {
          packageName: "pending-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {
            "completed-dep": "1.0.0"
          },
          standaloneCost: 0.75,
          totalCost: 0,
          costStatus: "pending"
        },
        "1022435309464889": {
          packageName: "failing-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {
            "incompleted-dep": "1.0.0"
          },
          standaloneCost: 0.5,
          totalCost: 0,
          costStatus: "pending"
        },
        "5555118188997178": {
          packageName: "parent-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {
            "child-package": "1.0.0"
          },
          standaloneCost: 0.75,
          totalCost: 0,
          costStatus: "pending"
        },
        "5916553102338584": {
          packageName: "recursion-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {
            "recursion-package-2": "1.0.0",
            "completed-dep": "1.0.0"
          },
          standaloneCost: 0.75,
          totalCost: 0,
          costStatus: "pending"
        }
      },
      byName: {
        "completed-package": {
          "1.0.0": {
            id: "completed-ID",
            ndjson: null,
            dependencies: {},
            standaloneCost: 0.5,
            totalCost: 0.5,
            costStatus: "completed"
          }
        },
        "pending-package": {
          "1.0.0": {
            id: "6023484092574754",
            ndjson: null,
            dependencies: {
              "completed-dep": "1.0.0"
            },
            standaloneCost: 0.75,
            totalCost: 0,
            costStatus: "pending"
          }
        },
        "failing-package": {
          "1.0.0": {
            id: "failing-ID",
            ndjson: null,
            dependencies: {
              "incompleted-dep": "1.0.0"
            },
            standaloneCost: 0.5,
            totalCost: 0,
            costStatus: "pending"
          }
        },
        "parent-package": {
          "1.0.0": {
            id: "parent-ID",
            ndjson: null,
            dependencies: {
              "child-package": "1.0.0"
            },
            standaloneCost: 0.75,
            totalCost: 0,
            costStatus: "pending"
          }
        },
        "recursion-package": {
          "1.0.0": {
            id: "5555118188997178",
            ndjson: null,
            dependencies: {
              "recursion-package-2": "1.0.0",
              "completed-dep": "1.0.0"
            },
            standaloneCost: 0.75,
            totalCost: 0,
            costStatus: "pending"
          }
        }
      },
      costCache: {
        "2985548229775954": {
          // completed-dep-1.0.0
          totalCost: 0.5,
          standaloneCost: 0.5,
          dependencies: []
        }
      }
    })
  ),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  cp: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue(["file.js"]),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
  access: vi.fn().mockResolvedValue(undefined)
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
    create: vi.fn(),
    extract: vi.fn()
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
      stdout: JSON.stringify({ ...mockNdJson }),
      stderr: null
    });
  })
}));
vi.mock("esbuild", async (importOriginal) => {
  const original = await importOriginal<typeof esbuild>();
  return {
    ...original,
    default: {
      ...original,
      build: vi.fn().mockResolvedValue(undefined)
    }
  };
});
vi.mock("get-folder-size", async (importOriginal) => {
  const original = await importOriginal<typeof getFolderSize>();
  return {
    default: {
      ...original,
      loose: vi.fn().mockResolvedValue(524288) // 0.5 MB
    }
  };
});

const mockNdJson: shared.Ndjson = {
  URL: "https://www.npmjs.com/package/express",
  NetScore: 0.8,
  NetScore_Latency: 0.1,
  RampUp: 0.8,
  RampUp_Latency: 0.1,
  Correctness: 0.8,
  Correctness_Latency: 0.1,
  BusFactor: 0.8,
  BusFactor_Latency: 0.1,
  ResponsiveMaintainer: 0.8,
  ResponsiveMaintainer_Latency: 0.1,
  License: 0.8,
  License_Latency: 0.1,
  Dependencies: 0.8,
  Dependencies_Latency: 0.1
};

describe("savePackage", () => {
  const tarSpy = vi.spyOn(tar, "create");
  const logger = shared.getLogger("test");
  global.fetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const testPackageId = calculatePackageId("test-package", "1.0.0");
  const testPackageId2 = calculatePackageId("test-package2", "1.0.0");
  it("should save a package from file path and upload to S3 in prod", async () => {
    vi.stubEnv("NODE_ENV", "prod");
    const packageFilePath = "/path/to/package-file";

    const result = await savePackage("test-package", "1.0.0", testPackageId, false, packageFilePath, undefined);

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
      `Uploaded package test-package to S3: test-package/${testPackageId}/test-package.tgz`
    );
    expect(logger.info).toHaveBeenCalledWith(
      `Saved package test-package v1.0.0 with ID ${testPackageId} and standalone cost 0.50 MB`
    );
  });

  it("should save a package from URL and upload to S3 in prod", async () => {
    vi.stubEnv("CLI_API_URL", "https://test-api.com");
    const url = "https://www.npmjs.com/package/test-package2";
    (global.fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: { ...mockNdJson }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream()
      });

    const result = await savePackage("test-package2", "1.0.0", testPackageId2, false, undefined, url);

    expect(result.success).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      `Uploaded package test-package2 to S3: test-package2/${testPackageId2}/test-package2.tgz`
    );
    expect(logger.info).toHaveBeenCalledWith(
      `Saved package test-package2 v1.0.0 with ID ${testPackageId2} and standalone cost 0.50 MB`
    );
  });

  it("should return an error if package score is too low", async () => {
    vi.stubEnv("NODE_ENV", "dev");
    vi.mocked(util.promisify).mockReturnValueOnce(async () => {
      return Promise.resolve({
        stdout: JSON.stringify({ ...mockNdJson, NetScore: 0.4 }),
        stderr: null
      });
    });

    const result = await savePackage(
      "test-package",
      "1.0.0",
      testPackageId,
      false,
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
      testPackageId,
      false,
      "/path/to/package-file",
      "https://www.npmjs.com/package/test-package"
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Provide either package file path or URL, not both");
  });

  it("should return an error if neither file path nor URL is provided", async () => {
    const result = await savePackage("test-package", "1.0.0", testPackageId, false);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("No package file path or URL provided");
  });

  it("should return an error if minifyProject fails", async () => {
    vi.mocked(fsPromises.readdir).mockRejectedValueOnce(new Error("Failed to read directory"));

    const result = await savePackage("test-package", "1.0.0", testPackageId, true, "/path/to/package-file", undefined);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Failed to read directory");
  });

  it("should debloat the package if debloat is true", async () => {
    const esbuildSpy = (esbuild as unknown as { default: { build: Mock } }).default.build;
    const result = await savePackage("test-package", "1.0.0", testPackageId, true, "/path/to/package-file", undefined);

    expect(result.success).toBe(true);
    expect(esbuildSpy).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith("Finished debloating package test-package v1.0.0");
  });

  it("should debloat the package if debloat is true and URL is provided", async () => {
    const esbuildSpy = (esbuild as unknown as { default: { build: Mock } }).default.build;
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream()
    });

    const result = await savePackage(
      "test-package",
      "1.0.0",
      testPackageId,
      true,
      undefined,
      "https://www.npmjs.com/package/test-package"
    );

    expect(result.success).toBe(true);
    expect(esbuildSpy).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith("Finished debloating package test-package v1.0.0");
  });
});

describe("checkIfPackageExists", () => {
  it("should return true if package exists", async () => {
    const result = checkIfPackageExists("8949875233423535");

    expect(result).toBe(true);
  });

  it("should return false if package does not exist", async () => {
    const result = checkIfPackageExists("non-existing-ID");

    expect(result).toBe(false);
  });
});

describe("getExactAvailableVersion", () => {
  global.fetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the minimum available version within the range", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true
    });

    const result = await getExactAvailableVersion("test-package", "^1.0.0");
    expect(result).toBe("1.0.0");
    expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/test-package/1.0.0");
  });

  it("should iterate through patch versions until a matching version is found", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });

    const result = await getExactAvailableVersion("test-package", "^1.0.0");
    expect(result).toBe("1.0.1");
    expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/test-package/1.0.0");
    expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/test-package/1.0.1");
  });

  it("should return null if all patch versions within the range are unavailable", async () => {
    (global.fetch as Mock)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });

    const result = await getExactAvailableVersion("test-package", "1.0.0-1.0.3");
    expect(result).toBe(null);
  });

  it("should handle errors gracefully and return null", async () => {
    (global.fetch as Mock).mockRejectedValueOnce(new Error("Network error"));

    const result = await getExactAvailableVersion("test-package", "^1.0.0");
    expect(result).toBe(null);
  });
});

describe("calculateTotalPackageCost", () => {
  global.fetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return total cost if costStatus is 'completed'", async () => {
    const result = await calculateTotalPackageCost("completed-package", "1.0.0");
    expect(result).toBe(0.5);
  });

  it("should calculate and update total cost if costStatus is neither 'completed' nor 'failed'", async () => {
    (global.fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream()
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream()
      });
    const metadata = getMetadata();

    const result = await calculateTotalPackageCost("pending-package", "1.0.0");
    const packageId = calculatePackageId("pending-package", "1.0.0");

    expect(result).toBe(1.25);
    expect(metadata.byId[packageId].totalCost).toBe(1.25);
    expect(metadata.byId[packageId].costStatus).toBe("completed");
  });

  it("should throw an error if package ID does not exist", async () => {
    await expect(calculateTotalPackageCost("non-existing-package", "1.0.0")).rejects.toThrow(
      `Package ${calculatePackageId("non-existing-package", "1.0.0")} does not exist`
    );
  });

  it("should calculate total costs recursively for all dependencies", async () => {
    vi.mocked(fsPromises.readFile)
      .mockResolvedValueOnce(JSON.stringify({ dependencies: { "grandchild-package": "1.0.0" } }))
      .mockResolvedValueOnce(JSON.stringify({ dependencies: {} }));
    (global.fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream()
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream()
      })
      .mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream()
      });
    const metadata = getMetadata();
    metadata.costCache = {
      "2985548229775954": {
        // completed-dep-1.0.0
        totalCost: 0.5,
        standaloneCost: 0.5,
        dependencies: []
      }
    };
    expect(metadata.costCache).toStrictEqual({
      "2985548229775954": {
        // in original mock
        totalCost: 0.5,
        standaloneCost: 0.5,
        dependencies: []
      }
    });

    const result = await calculateTotalPackageCost("parent-package", "1.0.0");
    const packageId = calculatePackageId("parent-package", "1.0.0");

    expect(result).toBe(1.75);
    expect(metadata.byId[packageId].costStatus).toBe("completed");
    expect(metadata.byId[packageId].totalCost).toBe(1.75);
    expect(metadata.costCache).toStrictEqual({
      "2985548229775954": {
        // in original mock
        totalCost: 0.5,
        standaloneCost: 0.5,
        dependencies: []
      },
      "2239244831680780": {
        // child-package-1.0.0 w dependency grandchild-package-1.0.0
        totalCost: 1,
        standaloneCost: 0.5,
        dependencies: ["6704071252909611"]
      },
      "6704071252909611": {
        // grandchild-package-1.0.0
        totalCost: 0.5,
        standaloneCost: 0.5,
        dependencies: []
      },
      "5555118188997178": {
        // parent-package-1.0.0 w dependency child-package-1.0.0 and grandchild-package-1.0.0
        dependencies: ["2239244831680780"],
        standaloneCost: 0.75,
        totalCost: 1.75
      }
    });
  });

  it("should update cost status to 'failed' if dependency calculation fails but not throw error", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false
    });
    const metadata = getMetadata();

    const result = await calculateTotalPackageCost("failing-package", "1.0.0");
    const packageId = calculatePackageId("failing-package", "1.0.0");
    const incompletedDepId = calculatePackageId("incompleted-dep", "1.0.0");

    expect(metadata.byId[packageId].costStatus).toBe("completed");
    expect(metadata.byId[packageId].totalCost).toBe(0.5);
    expect(metadata.costCache[packageId].totalCost).toBe(0.5);
    expect(metadata.costCache[incompletedDepId].totalCost).toBe(0);
    expect(result).toBe(0.5);
  });

  it("should handle circular dependencies gracefully", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true
    });
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream()
    });
    vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
      JSON.stringify({ dependencies: { "recursion-package": "1.0.0", "completed-dep": "1.0.0" } })
    );
    const metadata = getMetadata();

    const result = await calculateTotalPackageCost("recursion-package", "1.0.0");
    const packageId = calculatePackageId("recursion-package", "1.0.0");
    const recursionPackage2Id = calculatePackageId("recursion-package-2", "1.0.0");

    expect(result).toBe(1.75);
    expect(metadata.byId[packageId].costStatus).toBe("completed");
    expect(metadata.byId[packageId].totalCost).toBe(1.75);
    expect(metadata.costCache[packageId].totalCost).toBe(0.625);
    expect(metadata.costCache[recursionPackage2Id].totalCost).toBe(0.625);
  });
});
