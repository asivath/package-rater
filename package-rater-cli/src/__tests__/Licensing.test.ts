import { describe, it, expect, Mock, vi } from "vitest";
import fs from "fs/promises";
import { calculateLicense } from "../metrics/License"; // Update with the actual path

vi.mock("fs/promises");
describe("calculateLicense", () => {
  const owner = "ownerName";
  const repo = "repoName";
  const repoDir = "/path/to/cloned-repo";

  it("should return the correct score for a valid license in package.json", async () => {
    // Mocking fs.readFile to return a package.json with a specific license
    const mockPackageJson = JSON.stringify({ license: "MIT" });
    (fs.readFile as Mock).mockResolvedValueOnce(mockPackageJson);

    const score = await calculateLicense(owner, repo, repoDir);
    expect(score).toBe(1);
  });

  it("should return the correct score for a valid license in LICENSE file", async () => {
    // Mocking fs.readFile for package.json to return undefined license
    (fs.readFile as Mock).mockResolvedValueOnce("{}");

    // Mocking fs.readFile for LICENSE file
    (fs.readFile as Mock).mockResolvedValueOnce("This project is licensed under the MIT License.");

    const score = await calculateLicense(owner, repo, repoDir);
    expect(score).toBe(1);
  });

  it("should return 0 if no license is found", async () => {
    // Mocking fs.readFile to throw an error indicating no license found
    (fs.readFile as Mock).mockRejectedValueOnce(new Error("ENOENT")); // Simulate missing package.json
    (fs.readFile as Mock).mockRejectedValueOnce(new Error("ENOENT")); // Simulate missing LICENSE file

    const score = await calculateLicense(owner, repo, repoDir);
    expect(score).toBe(0);
  });

  it("should handle errors from cloneRepository gracefully", async () => {
    const failedRepoDir = null; // Simulate an invalid directory

    const score = await calculateLicense(owner, repo, failedRepoDir);
    expect(score).toBe(0);
  });
});
