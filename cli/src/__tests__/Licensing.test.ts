import { describe, it, expect, vi } from "vitest";
import fs from "fs/promises";
import { calculateLicense } from "../metrics/License";
import * as shared from "@package-rater/shared";

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

vi.mock("fs/promises");
describe("calculateLicense", () => {
  const owner = "ownerName";
  const repo = "repoName";
  const repoDir = "/path/to/cloned-repo";
  const readFile = vi.spyOn(fs, "readFile");

  it("should return the correct score for a valid license in package.json", async () => {
    const mockPackageJson = JSON.stringify({ license: "MIT" });
    readFile.mockResolvedValueOnce(mockPackageJson);

    const score = await calculateLicense(owner, repo, repoDir);
    expect(score).toBe(1);
  });

  it("should return the correct score for a valid license in LICENSE file", async () => {
    readFile.mockResolvedValueOnce("{}");
    readFile.mockResolvedValueOnce("This project is licensed under the MIT License.");

    const score = await calculateLicense(owner, repo, repoDir);
    expect(score).toBe(1);
  });

  it("should return the correct score for a valid license in README.md", async () => {
    readFile.mockResolvedValueOnce("{}");
    readFile.mockResolvedValueOnce("LMAO");
    readFile.mockResolvedValueOnce("This project is licensed under the MIT License.");

    const score = await calculateLicense(owner, repo, repoDir);
    expect(score).toBe(1);
  });

  it("should return 0 if no license is found", async () => {
    // Simulate missing package.json, LICENSE, and README.md
    readFile.mockRejectedValueOnce(new Error("ENOENT")).mockRejectedValueOnce(new Error("ENOENT")).mockRejectedValueOnce(new Error("ENOENT"));

    const score = await calculateLicense(owner, repo, repoDir);
    expect(score).toBe(0);
  });

  it("should handle errors from cloneRepository gracefully", async () => {
    const score = await calculateLicense(owner, repo);
    expect(score).toBe(0);
  });
});
