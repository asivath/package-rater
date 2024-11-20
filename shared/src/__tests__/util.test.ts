import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import { getGithubRepo, cloneRepo } from "../util";
import { getLogger } from "../logger";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { simpleGit } from "simple-git";

vi.mock("fs/promises");
vi.mock("simple-git");
vi.mock("../logger", () => {
  return {
    getLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn()
    })
  };
});

global.fetch = vi.fn();
describe("getGithubRepo", () => {
  const logger = getLogger("utilTest");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch the GitHub repo URL from a valid NPM URL", async () => {
    const npmUrl = "https://www.npmjs.com/package/some-package";
    const mockResponse = {
      repository: {
        url: "git+https://github.com/user/some-package.git"
      }
    };
    (fetch as Mock).mockResolvedValueOnce({
      json: vi.fn().mockResolvedValueOnce(mockResponse)
    });

    const result = await getGithubRepo(npmUrl);
    expect(result).toBe("https://github.com/user/some-package");
    expect(logger.info).toHaveBeenCalledWith("Handling NPM URL");
    expect(logger.info).toHaveBeenCalledWith("Owner: user, Package: some-package");
  });

  it("should return null for an invalid NPM URL", async () => {
    const npmUrl = "https://www.npmjs.com/onvalid-package";
    const result = await getGithubRepo(npmUrl);
    expect(result).toBe(null);
    expect(logger.info).toHaveBeenCalledWith("Invalid NPM URL");
  });
  it("should return a valid GitHub URL directly", async () => {
    const githubUrl = "https://github.com/user/repo";
    const result = await getGithubRepo(githubUrl);
    expect(result).toBe(githubUrl);
    expect(logger.error).not.toHaveBeenCalled();
  });
  it("should return null for an invalid URL format", async () => {
    const invalidUrl = "https://invalid.url.com";
    const result = await getGithubRepo(invalidUrl);
    expect(result).toBe(null);
    expect(logger.error).toHaveBeenCalledWith("Invalid URL format");
  });
  it("should handle fetch errors gracefully", async () => {
    const npmUrl = "https://www.npmjs.com/package/some-package";
    (fetch as Mock).mockRejectedValueOnce(new Error("Fetch error"));
    const result = await getGithubRepo(npmUrl);
    expect(result).toBe(null);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Error fetching NPM package:"));
  });
});
describe("getGithubRepo", () => {
  const repoUrl = "https://github.com/user/repo.git";
  const repoName = "repo";
  const expectedRepoDir = path.resolve(os.tmpdir(), repoName);
  const logger = getLogger("utilTest");
  const mkdirSpy = vi.spyOn(fs, "mkdir");
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("should clone a repository to the specified directory", async () => {
    const gitClone = vi.fn().mockResolvedValue(undefined);
    (simpleGit as Mock).mockReturnValueOnce({ clone: gitClone });
    const repoDir = await cloneRepo(repoUrl, repoName);

    expect(logger.info).toHaveBeenCalledWith(`Repository successfully cloned to ${expectedRepoDir}`);
    expect(repoDir).toBe(expectedRepoDir);
    expect(mkdirSpy).toHaveBeenCalledWith(expectedRepoDir, { recursive: true });
    expect(gitClone).toHaveBeenCalledWith(repoUrl, expectedRepoDir, ["--depth", "1"]);
  });
  it("should return null if the file path is invalid", async () => {
    const invalidRepoName = "..";
    const repoDir = await cloneRepo(repoUrl, invalidRepoName);
    expect(repoDir).toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith("Invalid file path");
    expect(mkdirSpy).not.toHaveBeenCalled();
  });
  it("should return null if there is an with cloning the repo'", async () => {
    const gitClone = vi.fn().mockRejectedValueOnce(new Error("some other error"));
    (simpleGit as Mock).mockReturnValueOnce({ clone: gitClone });
    const repoDir = await cloneRepo(repoUrl, repoName);

    expect(repoDir).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(`Error cloning repository ${repoUrl}:`, new Error("some other error"));
  });
});
