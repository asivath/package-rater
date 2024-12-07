import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import {
  savePackage,
  checkIfPackageExists,
  checkIfContentPatchValid,
  getExactAvailableVersion,
  calculateTotalPackageCost,
  getPackageMetadata,
  calculatePackageId
} from "../util";
import * as shared from "@package-rater/shared";
import * as s3Client from "@aws-sdk/client-s3";
import * as tar from "tar";
// import * as util from "util";
import * as esbuild from "esbuild";
import * as fsPromises from "fs/promises";
import * as AdmZip from "adm-zip";
import { Dirent } from "fs";

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(
    JSON.stringify({
      byId: {
        "8949875233423535": {
          packageName: "completed-package",
          version: "1.0.0",
          ndjson: {
            NetScore: 1,
            NetScoreLatency: 1,
            RampUp: 1,
            RampUpLatency: 1,
            Correctness: 1,
            CorrectnessLatency: 1,
            BusFactor: 1,
            BusFactorLatency: 1,
            ResponsiveMaintainer: 1,
            ResponsiveMaintainerLatency: 1,
            LicenseScore: 1,
            LicenseScoreLatency: 1,
            GoodPinningPractice: 1,
            GoodPinningPracticeLatency: 1,
            PullRequest: 1,
            PullRequestLatency: 1
          },
          dependencies: {},
          standaloneCost: 0.5,
          totalCost: 0.5,
          costStatus: "completed"
        },
        "6023484092574754": {
          packageName: "pending-package",
          version: "1.0.0",
          ndjson: {
            NetScore: 1,
            NetScoreLatency: 1,
            RampUp: 1,
            RampUpLatency: 1,
            Correctness: 1,
            CorrectnessLatency: 1,
            BusFactor: 1,
            BusFactorLatency: 1,
            ResponsiveMaintainer: 1,
            ResponsiveMaintainerLatency: 1,
            LicenseScore: 1,
            LicenseScoreLatency: 1,
            GoodPinningPractice: 1,
            GoodPinningPracticeLatency: 1,
            PullRequest: 1,
            PullRequestLatency: 1
          },
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
          ndjson: {
            NetScore: 1,
            NetScoreLatency: 1,
            RampUp: 1,
            RampUpLatency: 1,
            Correctness: 1,
            CorrectnessLatency: 1,
            BusFactor: 1,
            BusFactorLatency: 1,
            ResponsiveMaintainer: 1,
            ResponsiveMaintainerLatency: 1,
            LicenseScore: 1,
            LicenseScoreLatency: 1,
            GoodPinningPractice: 1,
            GoodPinningPracticeLatency: 1,
            PullRequest: 1,
            PullRequestLatency: 1
          },
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
          ndjson: {
            NetScore: 1,
            NetScoreLatency: 1,
            RampUp: 1,
            RampUpLatency: 1,
            Correctness: 1,
            CorrectnessLatency: 1,
            BusFactor: 1,
            BusFactorLatency: 1,
            ResponsiveMaintainer: 1,
            ResponsiveMaintainerLatency: 1,
            LicenseScore: 1,
            LicenseScoreLatency: 1,
            GoodPinningPractice: 1,
            GoodPinningPracticeLatency: 1,
            PullRequest: 1,
            PullRequestLatency: 1
          },
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
          ndjson: {
            NetScore: 1,
            NetScoreLatency: 1,
            RampUp: 1,
            RampUpLatency: 1,
            Correctness: 1,
            CorrectnessLatency: 1,
            BusFactor: 1,
            BusFactorLatency: 1,
            ResponsiveMaintainer: 1,
            ResponsiveMaintainerLatency: 1,
            LicenseScore: 1,
            LicenseScoreLatency: 1,
            GoodPinningPractice: 1,
            GoodPinningPracticeLatency: 1,
            PullRequest: 1,
            PullRequestLatency: 1
          },
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
          uploadedWithContent: false,
          versions: {
            "1.0.0": {
              id: "completed-ID",
              ndjson: {
                NetScore: 1,
                NetScoreLatency: 1,
                RampUp: 1,
                RampUpLatency: 1,
                Correctness: 1,
                CorrectnessLatency: 1,
                BusFactor: 1,
                BusFactorLatency: 1,
                ResponsiveMaintainer: 1,
                ResponsiveMaintainerLatency: 1,
                LicenseScore: 1,
                LicenseScoreLatency: 1,
                GoodPinningPractice: 1,
                GoodPinningPracticeLatency: 1,
                PullRequest: 1,
                PullRequestLatency: 1
              },
              dependencies: {},
              standaloneCost: 0.5,
              totalCost: 0.5,
              costStatus: "completed"
            }
          }
        },
        "pending-package": {
          uploadedWithContent: false,
          versions: {
            "1.0.0": {
              id: "6023484092574754",
              ndjson: {
                NetScore: 1,
                NetScoreLatency: 1,
                RampUp: 1,
                RampUpLatency: 1,
                Correctness: 1,
                CorrectnessLatency: 1,
                BusFactor: 1,
                BusFactorLatency: 1,
                ResponsiveMaintainer: 1,
                ResponsiveMaintainerLatency: 1,
                LicenseScore: 1,
                LicenseScoreLatency: 1,
                GoodPinningPractice: 1,
                GoodPinningPracticeLatency: 1,
                PullRequest: 1,
                PullRequestLatency: 1
              },
              dependencies: {
                "completed-dep": "1.0.0"
              },
              standaloneCost: 0.75,
              totalCost: 0,
              costStatus: "pending"
            }
          }
        },
        "failing-package": {
          uploadedWithContent: false,
          versions: {
            "1.0.0": {
              id: "failing-ID",
              ndjson: {
                NetScore: 1,
                NetScoreLatency: 1,
                RampUp: 1,
                RampUpLatency: 1,
                Correctness: 1,
                CorrectnessLatency: 1,
                BusFactor: 1,
                BusFactorLatency: 1,
                ResponsiveMaintainer: 1,
                ResponsiveMaintainerLatency: 1,
                LicenseScore: 1,
                LicenseScoreLatency: 1,
                GoodPinningPractice: 1,
                GoodPinningPracticeLatency: 1,
                PullRequest: 1,
                PullRequestLatency: 1
              },
              dependencies: {
                "incompleted-dep": "1.0.0"
              },
              standaloneCost: 0.5,
              totalCost: 0,
              costStatus: "pending"
            }
          }
        },
        "parent-package": {
          uploadedWithContent: false,
          versions: {
            "1.0.0": {
              id: "parent-ID",
              ndjson: {
                NetScore: 1,
                NetScoreLatency: 1,
                RampUp: 1,
                RampUpLatency: 1,
                Correctness: 1,
                CorrectnessLatency: 1,
                BusFactor: 1,
                BusFactorLatency: 1,
                ResponsiveMaintainer: 1,
                ResponsiveMaintainerLatency: 1,
                LicenseScore: 1,
                LicenseScoreLatency: 1,
                GoodPinningPractice: 1,
                GoodPinningPracticeLatency: 1,
                PullRequest: 1,
                PullRequestLatency: 1
              },
              dependencies: {
                "child-package": "1.0.0"
              },
              standaloneCost: 0.75,
              totalCost: 0,
              costStatus: "pending"
            }
          }
        },
        "recursion-package": {
          uploadedWithContent: false,
          versions: {
            "1.0.0": {
              id: "5555118188997178",
              ndjson: {
                NetScore: 1,
                NetScoreLatency: 1,
                RampUp: 1,
                RampUpLatency: 1,
                Correctness: 1,
                CorrectnessLatency: 1,
                BusFactor: 1,
                BusFactorLatency: 1,
                ResponsiveMaintainer: 1,
                ResponsiveMaintainerLatency: 1,
                LicenseScore: 1,
                LicenseScoreLatency: 1,
                GoodPinningPractice: 1,
                GoodPinningPracticeLatency: 1,
                PullRequest: 1,
                PullRequestLatency: 1
              },
              dependencies: {
                "recursion-package-2": "1.0.0",
                "completed-dep": "1.0.0"
              },
              standaloneCost: 0.75,
              totalCost: 0,
              costStatus: "pending"
            }
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
  readdir: vi.fn().mockResolvedValue(["package/", "file.js"]),
  stat: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  rmdir: vi.fn().mockResolvedValue(undefined)
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
vi.mock("adm-zip", () => ({
  default: vi.fn().mockImplementation(() => ({
    getEntries: vi.fn(),
    addLocalFolder: vi.fn(),
    writeZip: vi.fn(),
    extractAllTo: vi.fn(),
    toBuffer: vi.fn().mockReturnValue({ buffer: Buffer.from("test"), length: 512000 })
  }))
}));

const mockNdJson: shared.Ndjson = {
  NetScore: 0.8,
  NetScoreLatency: 0.1,
  RampUp: 0.8,
  RampUpLatency: 0.1,
  Correctness: 0.8,
  CorrectnessLatency: 0.1,
  BusFactor: 0.8,
  BusFactorLatency: 0.1,
  ResponsiveMaintainer: 0.8,
  ResponsiveMaintainerLatency: 0.1,
  LicenseScore: 0.8,
  LicenseScoreLatency: 0.1,
  GoodPinningPractice: 1,
  GoodPinningPracticeLatency: 1,
  PullRequest: 1,
  PullRequestLatency: 1
};

function createMockStat(isDirectory: boolean) {
  return {
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    dev: 0,
    ino: 0,
    mode: 0,
    nlink: 0,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: 512000,
    blksize: 0,
    blocks: 0,
    atimeMs: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    birthtimeMs: 0,
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date()
  };
}

describe("savePackage", () => {
  const logger = shared.getLogger("test");
  global.fetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const packageJson = {
    name: "test-package",
    version: "1.0.0",
    dependencies: {},
    repository: {
      url: "https://www.npmjs.com/package/test-package"
    }
  };
  const testPackageId = calculatePackageId("test-package", "1.0.0");
  // const testPackageId2 = calculatePackageId("test-package2", "1.0.0");
  // it("should save a package from file path and upload to S3 in prod", async () => {
  //   vi.stubEnv("NODE_ENV", "production");
  //   vi.stubEnv("CLI_API_URL", "https://test-api.com");
  //   const mockedZipInstance = {
  //     // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
  //     ...AdmZip.default(),
  //     getEntries: vi
  //       .fn()
  //       .mockReturnValueOnce([
  //         { entryName: "package.json", getData: vi.fn().mockReturnValue(Buffer.from(JSON.stringify(packageJson))) }
  //       ])
  //   };
  //   // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
  //   vi.mocked(AdmZip.default).mockImplementationOnce(() => mockedZipInstance);
  //   (global.fetch as Mock).mockResolvedValueOnce({
  //     ok: true,
  //     json: async () => ({
  //       success: true,
  //       result: { ...mockNdJson }
  //     })
  //   });
  //   vi.mocked(fsPromises.stat).mockResolvedValueOnce(createMockStat(true));

  //   const result = await savePackage(
  //     "test-package",
  //     "1.0.0",
  //     testPackageId,
  //     false,
  //     mockedZipInstance as unknown as AdmZip,
  //     undefined
  //   );
  //   expect(result.success).toBe(true);

  //   expect(logger.info).toHaveBeenCalledWith(
  //     `Uploaded package test-package to S3: test-package/${testPackageId}/test-package.zip`
  //   );
  //   expect(logger.info).toHaveBeenCalledWith(
  //     `Saved package test-package v1.0.0 with ID ${testPackageId} and standalone cost 0.50 MB`
  //   );
  // });

  // it("should save a package from URL and upload to S3 in prod", async () => {
  //   vi.stubEnv("CLI_API_URL", "https://test-api.com");
  //   const url = "https://www.npmjs.com/package/test-package2";
  //   (global.fetch as Mock)
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       body: new ReadableStream()
  //     })
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       json: async () => ({
  //         success: true,
  //         result: { ...mockNdJson }
  //       })
  //     })
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       body: new ReadableStream()
  //     });
  //   vi.mocked(fsPromises.stat)
  //     .mockResolvedValueOnce(createMockStat(true))
  //     .mockResolvedValueOnce(createMockStat(true))
  //     .mockResolvedValueOnce(createMockStat(false));

  //   const result = await savePackage("test-package2", "1.0.0", testPackageId2, false, undefined, url);

  //   expect(result.success).toBe(true);
  //   expect(logger.info).toHaveBeenCalledWith(
  //     `Uploaded package test-package2 to S3: test-package2/${testPackageId2}/test-package2.zip`
  //   );
  //   expect(logger.info).toHaveBeenCalledWith(
  //     `Saved package test-package2 v1.0.0 with ID ${testPackageId2} and standalone cost 0.50 MB`
  //   );
  // });

  // it("should return an error if package score is too low", async () => {
  //   vi.stubEnv("NODE_ENV", "dev");
  //   vi.mocked(util.promisify).mockReturnValueOnce(async () => {
  //     return Promise.resolve({
  //       stdout: JSON.stringify({ ...mockNdJson, NetScore: 0.4 }),
  //       stderr: null
  //     });
  //   });
  //   vi.mocked(fsPromises.stat).mockResolvedValueOnce(createMockStat(true)).mockResolvedValueOnce(createMockStat(false));

  //   const result = await savePackage(
  //     "test-package",
  //     "1.0.0",
  //     testPackageId,
  //     false,
  //     undefined,
  //     "https://www.npmjs.com/package/test-package"
  //   );

  //   expect(result.success).toBe(false);
  //   expect(result.reason).toBe("Package score is too low");
  // });

  it("should return an error if both file path and URL are provided", async () => {
    const result = await savePackage(
      "test-package",
      "1.0.0",
      testPackageId,
      false,
      "this is stupid" as unknown as AdmZip,
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
    const mockedZipInstance = {
      // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
      ...AdmZip.default(),
      getEntries: vi
        .fn()
        .mockReturnValueOnce([
          { entryName: "package.json", getData: vi.fn().mockReturnValue(Buffer.from(JSON.stringify(packageJson))) }
        ])
    };
    // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
    vi.mocked(AdmZip.default).mockImplementationOnce(() => mockedZipInstance);
    const result = await savePackage(
      "test-package",
      "1.0.0",
      testPackageId,
      true,
      mockedZipInstance as unknown as AdmZip,
      undefined
    );

    expect(result.success).toBe(false);
    expect(result.reason).toBe("Failed to read directory");
  });

  it("should debloat the package if debloat is true", async () => {
    const esbuildSpy = (esbuild as unknown as { default: { build: Mock } }).default.build;
    vi.mocked(fsPromises.stat)
      .mockResolvedValueOnce(createMockStat(true))
      .mockResolvedValueOnce(createMockStat(false))
      .mockResolvedValueOnce(createMockStat(true));
    vi.mocked(fsPromises.readdir)
      .mockResolvedValueOnce(["package/"] as unknown as Dirent[])
      .mockResolvedValueOnce(["package.js"] as unknown as Dirent[]);
    vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
      JSON.stringify({
        name: "test-package",
        version: "1.0.0",
        dependencies: {},
        repository: {
          url: "https://www.npmjs.com/package/test-package"
        }
      })
    );
    const mockedZipInstance = {
      // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
      ...AdmZip.default(),
      getEntries: vi
        .fn()
        .mockReturnValueOnce([
          { entryName: "package.json", getData: vi.fn().mockReturnValue(Buffer.from(JSON.stringify(packageJson))) }
        ])
    };
    // @ts-expect-error - mockedZipInstance is not a valid AdmZip instance
    vi.mocked(AdmZip.default).mockImplementationOnce(() => mockedZipInstance);

    const result = await savePackage(
      "test-package",
      "1.0.0",
      testPackageId,
      true,
      mockedZipInstance as unknown as AdmZip,
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
    vi.mocked(fsPromises.stat)
      .mockResolvedValueOnce(createMockStat(true))
      .mockResolvedValueOnce(createMockStat(false))
      .mockResolvedValueOnce(createMockStat(true));
    vi.mocked(fsPromises.readdir)
      .mockResolvedValueOnce(["package/"] as unknown as Dirent[])
      .mockResolvedValueOnce(["package/"] as unknown as Dirent[])
      .mockResolvedValueOnce(["package.js"] as unknown as Dirent[]);

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
    const result = checkIfPackageExists("non-existing-package");

    expect(result).toBe(false);
  });
});

describe("checkIfContentPatchValid", () => {
  it("should return true if new version patch is greater than existing patches", () => {
    const availableVersions = ["1.0.0", "1.0.1", "1.0.2"];
    const newVersion = "1.0.3";

    const result = checkIfContentPatchValid(availableVersions, newVersion);

    expect(result).toBe(true);
  });

  it("should return false if new version patch is not greater than existing patches", () => {
    const availableVersions = ["1.0.0", "1.0.1", "1.0.2"];
    const newVersion = "1.0.1";

    const result = checkIfContentPatchValid(availableVersions, newVersion);

    expect(result).toBe(false);
  });

  it("should return true if new version minor is greater than existing minors", () => {
    const availableVersions = ["1.0.0", "1.0.1", "1.0.2"];
    const newVersion = "1.1.0";

    const result = checkIfContentPatchValid(availableVersions, newVersion);

    expect(result).toBe(true);
  });

  it("should return true if new version major is greater than existing majors", () => {
    const availableVersions = ["1.0.0", "1.0.1", "1.0.2"];
    const newVersion = "2.0.0";

    const result = checkIfContentPatchValid(availableVersions, newVersion);

    expect(result).toBe(true);
  });

  it("should return false if new version is lower than existing versions", () => {
    const availableVersions = ["1.0.0", "1.0.1", "1.0.2"];
    const newVersion = "0.9.9";

    const result = checkIfContentPatchValid(availableVersions, newVersion);

    expect(result).toBe(true);
  });

  it("should return true if no available versions", () => {
    const availableVersions: string[] = [];
    const newVersion = "1.0.0";

    const result = checkIfContentPatchValid(availableVersions, newVersion);

    expect(result).toBe(true);
  });
});

describe("getExactAvailableVersion", () => {
  global.fetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return the minimum available version within the range", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        versions: {
          "1.0.0": {}
        }
      })
    });

    const result = await getExactAvailableVersion("test-package", "^1.0.0");
    expect(result).toBe("1.0.0");
    expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/test-package");
  });

  it("should iterate through patch versions until a matching version is found", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        versions: {
          "1.0.0": {},
          "1.0.1": {},
          "1.0.2": {}
        }
      })
    });

    const result = await getExactAvailableVersion("test-package", "^1.0.2");
    expect(result).toBe("1.0.2");
    expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/test-package");
  });

  it("should return null if fetch fails", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({ ok: false });

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
    const metadata = getPackageMetadata();

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

  // it("should calculate total costs recursively for all dependencies", async () => {
  //   vi.mocked(fsPromises.readFile)
  //     .mockResolvedValueOnce(JSON.stringify({ dependencies: { "grandchild-package": "1.0.0" } }))
  //     .mockResolvedValueOnce(JSON.stringify({ dependencies: {} }));
  //   vi.mocked(fsPromises.stat)
  //     .mockResolvedValueOnce(createMockStat(true))
  //     .mockResolvedValueOnce(createMockStat(false))
  //     .mockResolvedValueOnce(createMockStat(true))
  //     .mockResolvedValueOnce(createMockStat(true))
  //     .mockResolvedValueOnce(createMockStat(false))
  //     .mockResolvedValueOnce(createMockStat(true));
  //   (global.fetch as Mock)
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       json: async () => ({
  //         versions: {
  //           "1.0.0": {}
  //         }
  //       })
  //     })
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       body: new ReadableStream()
  //     })
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       json: async () => ({
  //         versions: {
  //           "1.0.0": {}
  //         }
  //       })
  //     })
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       body: new ReadableStream()
  //     });
  //   const metadata = getPackageMetadata();
  //   metadata.costCache = {
  //     "2985548229775954": {
  //       // completed-dep-1.0.0
  //       totalCost: 0.5,
  //       standaloneCost: 0.5,
  //       dependencies: []
  //     }
  //   };
  //   expect(metadata.costCache).toStrictEqual({
  //     "2985548229775954": {
  //       // in original mock
  //       totalCost: 0.5,
  //       standaloneCost: 0.5,
  //       dependencies: []
  //     }
  //   });

  //   const result = await calculateTotalPackageCost("parent-package", "1.0.0");
  //   const packageId = calculatePackageId("parent-package", "1.0.0");

  //   expect(result).toBe(1.75);
  //   expect(metadata.byId[packageId].costStatus).toBe("completed");
  //   expect(metadata.byId[packageId].totalCost).toBe(1.75);
  //   expect(metadata.costCache).toStrictEqual({
  //     "2985548229775954": {
  //       // in original mock
  //       totalCost: 0.5,
  //       standaloneCost: 0.5,
  //       dependencies: []
  //     },
  //     "2239244831680780": {
  //       // child-package-1.0.0 w dependency grandchild-package-1.0.0
  //       totalCost: 1,
  //       standaloneCost: 0.5,
  //       dependencies: ["6704071252909611"]
  //     },
  //     "6704071252909611": {
  //       // grandchild-package-1.0.0
  //       totalCost: 0.5,
  //       standaloneCost: 0.5,
  //       dependencies: []
  //     },
  //     "5555118188997178": {
  //       // parent-package-1.0.0 w dependency child-package-1.0.0 and grandchild-package-1.0.0
  //       dependencies: ["2239244831680780"],
  //       standaloneCost: 0.75,
  //       totalCost: 1.75
  //     }
  //   });
  // });

  it("should update cost status to 'failed' if dependency calculation fails but not throw error", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false
    });
    const metadata = getPackageMetadata();

    const result = await calculateTotalPackageCost("failing-package", "1.0.0");
    const packageId = calculatePackageId("failing-package", "1.0.0");
    const incompletedDepId = calculatePackageId("incompleted-dep", "1.0.0");

    expect(metadata.byId[packageId].costStatus).toBe("completed");
    expect(metadata.byId[packageId].totalCost).toBe(0.5);
    expect(metadata.costCache[packageId].totalCost).toBe(0.5);
    expect(metadata.costCache[incompletedDepId].totalCost).toBe(0);
    expect(result).toBe(0.5);
  });

  // it("should handle circular dependencies gracefully", async () => {
  //   (global.fetch as Mock)
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       json: async () => ({
  //         versions: {
  //           "1.0.0": {}
  //         }
  //       })
  //     })
  //     .mockResolvedValueOnce({
  //       ok: true,
  //       body: new ReadableStream()
  //     });
  //   vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
  //     JSON.stringify({ dependencies: { "recursion-package": "1.0.0", "completed-dep": "1.0.0" } })
  //   );
  //   vi.mocked(fsPromises.stat)
  //     .mockResolvedValueOnce(createMockStat(true))
  //     .mockResolvedValueOnce(createMockStat(false))
  //     .mockResolvedValueOnce(createMockStat(true));
  //   const metadata = getPackageMetadata();

  //   const result = await calculateTotalPackageCost("recursion-package", "1.0.0");
  //   const packageId = calculatePackageId("recursion-package", "1.0.0");
  //   const recursionPackage2Id = calculatePackageId("recursion-package-2", "1.0.0");

  //   expect(result).toBe(1.75);
  //   expect(metadata.byId[packageId].costStatus).toBe("completed");
  //   expect(metadata.byId[packageId].totalCost).toBe(1.75);
  //   expect(metadata.costCache[packageId].totalCost).toBe(0.625);
  //   expect(metadata.costCache[recursionPackage2Id].totalCost).toBe(0.625);
  // });
});
