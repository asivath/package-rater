import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { isPinnedToMajorMinor, findPackageJsonFiles, calculatePinnedDependencyFraction } from "../metrics/Dependencies";
import * as shared from "@package-rater/shared";
import { Dirent } from "fs";

vi.mock("@package-rater/shared", async (importOriginal) => {
  const original = await importOriginal<typeof shared>();
  return {
    ...original,
    getLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    })
  };
});

describe("isPinnedToMajorMinor", () => {
  it("should return false for version starting with caret (^)", () => {
    expect(isPinnedToMajorMinor("^1.2.3")).toBe(false);
  });

  it("should return true for a specific major.minor version", () => {
    expect(isPinnedToMajorMinor("1.2")).toBe(true);
    expect(isPinnedToMajorMinor("1.2.3")).toBe(true);
  });

  it("should return false for invalid version formats", () => {
    expect(isPinnedToMajorMinor("latest")).toBe(false);
    expect(isPinnedToMajorMinor("1.x")).toBe(false);
  });
});

describe("findPackageJsonFiles", () => {
  const readdir = vi.spyOn(fs, "readdir");
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should find package.json files recursively", async () => {
    const mockFiles = [
      { name: "dir1", isDirectory: () => true, isFile: () => false },
      { name: "package.json", isDirectory: () => false, isFile: () => true }
    ];
    readdir.mockResolvedValueOnce(mockFiles as Dirent[]).mockResolvedValueOnce([]);

    const packageJsonFiles = await findPackageJsonFiles("/fake-dir");
    expect(packageJsonFiles).toEqual([path.join("/fake-dir", "package.json")]);
  });

  it("should return an empty array if no package.json is found", async () => {
    const mockFiles = [
      { name: "dir1", isDirectory: () => true, isFile: () => false },
      { name: "file.txt", isDirectory: () => false, isFile: () => true }
    ];
    readdir.mockResolvedValueOnce(mockFiles as Dirent[]).mockResolvedValueOnce([]);

    const packageJsonFiles = await findPackageJsonFiles("/fake-dir");
    expect(packageJsonFiles).toEqual([]);
  });
});

describe("calculatePinnedDependencyFraction", () => {
  const readdir = vi.spyOn(fs, "readdir");
  const readFile = vi.spyOn(fs, "readFile");
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 0 and log an error if repoDir is not provided", async () => {
    const fraction = await calculatePinnedDependencyFraction("owner", "repo");
    expect(fraction).toBe(0);
  });

  it("should calculate pinned dependencies fraction correctly", async () => {
    const mockPackageJson = JSON.stringify({
      dependencies: {
        package1: "^1.0.0",
        package2: "1.2.0"
      },
      devDependencies: {
        package3: "2.3.0"
      }
    });

    readdir.mockResolvedValueOnce([{ name: "package.json", isDirectory: () => false, isFile: () => true } as Dirent]);
    readFile.mockResolvedValueOnce(mockPackageJson);

    const fraction = await calculatePinnedDependencyFraction("owner", "repo", "/fake-dir");
    expect(fraction).toBe(1 / 3); // One out of three dependencies is pinned
  });

  it("should return 1.0 if no dependencies are found", async () => {
    const mockPackageJson = JSON.stringify({
      dependencies: {},
      devDependencies: {}
    });

    readdir.mockResolvedValueOnce([{ name: "package.json", isDirectory: () => false, isFile: () => true } as Dirent]);
    readFile.mockResolvedValueOnce(mockPackageJson);

    const fraction = await calculatePinnedDependencyFraction("owner", "repo", "/fake-dir");
    expect(fraction).toBe(1.0); // No dependencies found
  });
});
