import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import {
  savePackage,
  checkIfPackageExists,
  getExactAvailableVersion,
  calculateTotalPackageCost,
  getMetadata
} from "../util";
import TaskQueue from "../taskQueue";
import * as shared from "@package-rater/shared";
import * as s3Client from "@aws-sdk/client-s3";
import * as tar from "tar";
import * as util from "util";
import * as esbuild from "esbuild";

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify({
      byId: {
        "completed-ID": {
          packageName: "completed-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {},
          standaloneCost: 0.5,
          totalCost: 0.5,
          costStatus: "completed"
        },
        "initiated-ID": {
          packageName: "initiated-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {},
          standaloneCost: 0.5,
          totalCost: 0,
          costStatus: "initiated"
        },
        "pending-ID": {
          packageName: "pending-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {
            "completed-dep": "1.0.0"
          },
          standaloneCost: 0.75,
          totalCost: 1,
          costStatus: "pending"
        },
        "failing-ID": {
          packageName: "failing-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {},
          standaloneCost: 0.5,
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
        "initiated-package": {
          "1.0.0": {
            id: "initiated-ID",
            ndjson: null,
            dependencies: {},
            standaloneCost: 0.5,
            totalCost: 0,
            costStatus: "initiated"
          }
        },
        "pending-package": {
          "1.0.0": {
            id: "pending-ID",
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
            dependencies: {},
            standaloneCost: 0.5,
            totalCost: 0,
            costStatus: "pending"
          }
        }
      },
      costCache: {
        "2985548229775954": {
          // completed-dep-1.0.0
          cost: 0.5,
          costStatus: "completed"
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
vi.mock("../taskQueue", async () => {
  return {
    default: vi.fn().mockReturnValue({
      addTask: vi.fn().mockResolvedValue(1.0),
      awaitTask: vi.fn().mockResolvedValue(1.0),
      hasTask: vi.fn().mockReturnValue(false)
    })
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

  it("should save a package from file path and upload to S3 in prod", async () => {
    vi.stubEnv("NODE_ENV", "prod");
    const packageFilePath = "/path/to/package-file";

    const result = await savePackage("test-package", "1.0.0", "new-package-id", false, packageFilePath, undefined);

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
    expect(logger.info).toHaveBeenCalledWith(
      "Saved package test-package v1.0.0 with ID new-package-id and standalone cost 0.00 MB"
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

    const result = await savePackage("test-package2", "1.0.0", "new-package-id", false, undefined, url);

    expect(result.success).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      "Uploaded package test-package2 to S3: test-package2/new-package-id/test-package2.tgz"
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Saved package test-package2 v1.0.0 with ID new-package-id and standalone cost 0.00 MB"
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
      "new-package-id",
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
      "new-package-id",
      false,
      "/path/to/package-file",
      "https://www.npmjs.com/package/test-package"
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Provide either package file path or URL, not both");
  });

  it("should return an error if neither file path nor URL is provided", async () => {
    const result = await savePackage("test-package", "1.0.0", "new-package-id", false);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("No package file path or URL provided");
  });

  it("should debloat the package if debloat is true", async () => {
    const esbuildSpy = (esbuild as unknown as { default: { build: Mock } }).default.build;
    const result = await savePackage(
      "test-package",
      "1.0.0",
      "new-package-id",
      true,
      "/path/to/package-file",
      undefined
    );

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
      "new-package-id",
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
    const result = checkIfPackageExists("completed-ID");

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
    (global.fetch as Mock).mockRejectedValue(new Error("Network error"));

    const result = await getExactAvailableVersion("test-package", "^1.0.0");
    expect(result).toBe(null);
  });
});

describe("calculateTotalPackageCost", () => {
  let taskQueue: TaskQueue;
  let taskPromises: Map<string, Promise<number>>;

  beforeEach(() => {
    taskQueue = new TaskQueue();
    taskPromises = new Map();
    vi.clearAllMocks();
  });

  it("should return total cost if costStatus is 'completed'", async () => {
    const result = await calculateTotalPackageCost("completed-ID");
    expect(result).toBe(0.5);
  });

  it("should wait for task completion if costStatus is 'initiated'", async () => {
    taskPromises.set("initiated-ID", Promise.resolve(10.0));
    vi.spyOn(taskQueue, "awaitTask").mockImplementation((id) => taskPromises.get(id)!);

    const result = await calculateTotalPackageCost("initiated-ID");

    expect(result).toBe(10.0);
    expect(taskQueue.awaitTask).toHaveBeenCalledWith("initiated-ID");
  });

  it("should calculate and update total cost if costStatus is neither 'completed' nor 'initiated'", async () => {
    vi.spyOn(taskQueue, "addTask").mockImplementationOnce(async (id, taskFn) => {
      return await taskFn();
    });
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true
    });
    const metadata = getMetadata();

    const result = await calculateTotalPackageCost("pending-ID");

    expect(result).toBe(1.25);
    expect(taskQueue.addTask).toHaveBeenCalledWith("pending-ID", expect.any(Function));
    expect(metadata.byId["pending-ID"].totalCost).toBe(1.25);
    expect(metadata.byId["pending-ID"].costStatus).toBe("completed");
  });

  it("should throw an error if package ID does not exist", async () => {
    await expect(calculateTotalPackageCost("non-existing-ID")).rejects.toThrow(
      "Package non-existing-ID does not exist"
    );
  });

  it("should update cost status to 'failed' if cost calculation fails", async () => {
    vi.spyOn(taskQueue, "addTask").mockRejectedValueOnce(new Error("Calculation failed"));
    const metadata = getMetadata();

    await expect(calculateTotalPackageCost("failing-ID")).rejects.toThrow("Calculation failed");

    expect(metadata.byId["failing-ID"].costStatus).toBe("failed");
  });
});
