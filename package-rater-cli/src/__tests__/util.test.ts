import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import { cloneRepo } from "../util";
import * as simpleGitModule from "simple-git";
import path from "path";
import * as fs from "fs/promises";
import { getLogger } from "../logger";

vi.mock("simple-git");
vi.mock("fs/promises");
vi.mock("../path/to/logger");

describe("cloneRepo", () => {
  const mockGitClone = vi.fn();
  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();
  const mockPathResolve = vi.spyOn(path, "resolve");

  beforeEach(() => {
    vi.clearAllMocks();
    (simpleGitModule.simpleGit as unknown as Mock).mockReturnValue({
      clone: mockGitClone
    });
    const logger = getLogger();
    logger.info = mockLoggerInfo;
    logger.error = mockLoggerError;
  });

  it("should clone the repository successfully", async () => {
    // Mock fs operations
    (fs.rm as Mock).mockResolvedValue(undefined);
    (fs.mkdir as Mock).mockResolvedValue(undefined);
    mockGitClone.mockResolvedValue(undefined); // Simulate successful clone

    const repoUrl = "https://github.com/test/repo.git";
    const repoName = "test-repo";
    const expectedPath = "/mocked/repos/test-repo";

    // Mock path.resolve to return a controlled path
    mockPathResolve.mockReturnValue(expectedPath);

    const result = await cloneRepo(repoUrl, repoName);

    expect(result).toBe(expectedPath);
    expect(mockLoggerInfo).toHaveBeenCalledWith(`Repository successfully cloned to ${expectedPath}`);
    expect(mockGitClone).toHaveBeenCalledWith(repoUrl, expectedPath, ["--depth", "1"]);
    expect(fs.rm).toHaveBeenCalledWith(expectedPath, { recursive: true, force: true });
    expect(fs.mkdir).toHaveBeenCalledWith(expectedPath, { recursive: true });
  });

  it("should return null and log an error if cloning fails", async () => {
    // Simulate an error during the clone
    const mockError = new Error("Clone failed");
    mockGitClone.mockRejectedValue(mockError);

    const repoUrl = "https://github.com/test/repo.git";
    const repoName = "test-repo";
    const expectedPath = "/mocked/repos/test-repo";

    // Mock path.resolve to return a controlled path
    mockPathResolve.mockReturnValue(expectedPath);

    const result = await cloneRepo(repoUrl, repoName);

    expect(result).toBeNull();
    expect(mockLoggerError).toHaveBeenCalledWith(`Error cloning repository ${repoUrl}:`, mockError);
  });

  it("should return null if the repository path is invalid", async () => {
    const invalidRepoName = "../invalid-repo";

    const result = await cloneRepo("https://github.com/test/repo.git", invalidRepoName);

    expect(result).toBeNull();
    expect(mockLoggerInfo).toHaveBeenCalledWith("Invalid file path");
  });
});
