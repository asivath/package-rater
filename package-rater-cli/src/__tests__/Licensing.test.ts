import { describe, it, expect, Mock, vi } from "vitest";
import fs from "fs/promises";
import { calculateLicense } from "../metrics/License"; // Update with the actual path
import { cloneRepository } from "../util";

vi.mock("fs/promises");
vi.mock("../util"); // Mocking the cloneRepository function

describe("calculateLicense", () => {
  const owner = "ownerName"; // Replace with actual test values
  const repo = "repoName"; // Replace with actual test values

  it("should return the correct score for a valid license in package.json", async () => {
    // Mocking fs.readFile to return a package.json with a specific license
    const mockPackageJson = JSON.stringify({ license: "MIT" });
    (fs.readFile as Mock).mockResolvedValueOnce(mockPackageJson);

    // Mocking compatibilityTable to return a score
    const expectedScore = 1;

    // Call the function
    const score = await calculateLicense(owner, repo);

    // Check if the score matches the expected score
    expect(score).toBe(expectedScore);
  });

  it("should return the correct score for a valid license in LICENSE file", async () => {
    // Mocking fs.readFile for package.json to return undefined license
    (fs.readFile as Mock).mockResolvedValueOnce("{}");

    // Mocking fs.readFile for LICENSE file
    (fs.readFile as Mock).mockResolvedValueOnce("This project is licensed under the MIT License.");

    const expectedScore = 1;

    // Call the function
    const score = await calculateLicense(owner, repo);

    // Check if the score matches the expected score
    expect(score).toBe(expectedScore);
  });

  it("should return 0 if no license is found", async () => {
    // Mocking fs.readFile to throw an error indicating no license found
    (fs.readFile as Mock).mockRejectedValueOnce(new Error("ENOENT")); // Simulate missing package.json
    (fs.readFile as Mock).mockRejectedValueOnce(new Error("ENOENT")); // Simulate missing LICENSE file

    // Call the function
    const score = await calculateLicense(owner, repo);

    // Check if the score is 0
    expect(score).toBe(0);
  });

  it("should handle errors from cloneRepository gracefully", async () => {
    // Mocking the cloneRepository to throw an error
    (cloneRepository as Mock).mockRejectedValueOnce(new Error("Failed to clone"));

    // Call the function
    const score = await calculateLicense(owner, repo);

    // Check if the score is 0
    expect(score).toBe(0);
  });

  it("should clean up the directory after cloning", async () => {
    // Mock fs.rm and fs.mkdir to do nothing
    (fs.rm as vi.Mock).mockResolvedValueOnce(undefined);
    (fs.mkdir as vi.Mock).mockResolvedValueOnce(undefined);

    // Call the function
    await calculateLicense(owner, repo);

    // Check if fs.rm and fs.mkdir are called
    expect(fs.rm).toHaveBeenCalledWith("/tmp/cloned-repo", { recursive: true, force: true });
    expect(fs.mkdir).toHaveBeenCalledWith("/tmp/cloned-repo", { recursive: true });
  });
});
