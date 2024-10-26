import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { isPinnedToMajorMinor, findPackageJsonFiles, calculatePinnedDependencyFraction } from "../metrics/Dependencies";

// Mocking the logger
vi.mock("../src/logger", () => ({
  getLogger: () => ({
    error: vi.fn(),
    info: vi.fn()
  })
}));

// Mocking fs module
vi.mock("fs/promises");

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should find package.json files recursively", async () => {
    const mockFiles = [
      { name: "dir1", isDirectory: () => true, isFile: () => false },
      { name: "package.json", isDirectory: () => false, isFile: () => true }
    ];

    // Mock readdir and stat
    (fs.readdir as Mock).mockResolvedValueOnce(mockFiles);

    const packageJsonFiles = await findPackageJsonFiles("/fake-dir");
    expect(packageJsonFiles).toEqual([path.join("/fake-dir", "package.json")]);
  });

  it("should return an empty array if no package.json is found", async () => {
    const mockFiles = [
      { name: "dir1", isDirectory: () => true, isFile: () => false },
      { name: "file.txt", isDirectory: () => false, isFile: () => true }
    ];

    (fs.readdir as Mock).mockResolvedValueOnce(mockFiles);

    const packageJsonFiles = await findPackageJsonFiles("/fake-dir");
    expect(packageJsonFiles).toEqual([]);
  });
});

describe("calculatePinnedDependencyFraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 0 and log an error if repoDir is not provided", async () => {
    const fraction = await calculatePinnedDependencyFraction("owner", "repo", null);
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

    (fs.readdir as Mock).mockResolvedValueOnce([
      { name: "package.json", isDirectory: () => false, isFile: () => true }
    ]);
    (fs.readFile as Mock).mockResolvedValueOnce(mockPackageJson);

    const fraction = await calculatePinnedDependencyFraction("owner", "repo", "/fake-dir");
    expect(fraction).toBe(1 / 3); // One out of three dependencies is pinned
  });

  it("should return 1.0 if no dependencies are found", async () => {
    const mockPackageJson = JSON.stringify({
      dependencies: {},
      devDependencies: {}
    });

    (fs.readdir as Mock).mockResolvedValueOnce([
      { name: "package.json", isDirectory: () => false, isFile: () => true }
    ]);
    (fs.readFile as Mock).mockResolvedValueOnce(mockPackageJson);

    const fraction = await calculatePinnedDependencyFraction("owner", "repo", "/fake-dir");
    expect(fraction).toBe(1.0); // No dependencies found
  });
});
