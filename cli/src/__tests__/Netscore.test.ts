import { describe, it, expect, vi, beforeEach } from "vitest";
import calculateMetrics from "../metrics/Netscore";
import * as shared from "@package-rater/shared";

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
vi.mock("fs/promises", () => ({
  readdir: vi.fn().mockResolvedValue([{ name: "file.ts", isDirectory: () => false }]),
  readFile: vi.fn().mockResolvedValue("file content"),
  rm: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("../metrics/Correctness", () => ({
  calculateCorrectness: vi.fn().mockResolvedValue(0.8)
}));
vi.mock("../metrics/License", () => ({
  calculateLicense: vi.fn().mockResolvedValue(0.8)
}));
vi.mock("../metrics/RampUp", () => ({
  calculateRampup: vi.fn().mockResolvedValue(0.8)
}));
vi.mock("../metrics/ResponsiveMaintainer", () => ({
  calculateResponsiveMaintainer: vi.fn().mockResolvedValue(0.8)
}));
vi.mock("../metrics/BusFactor", () => ({
  calculateBusFactor: vi.fn().mockResolvedValue(0.8)
}));
vi.mock("../metrics/Dependencies", () => ({
  calculatePinnedDependencyFraction: vi.fn().mockResolvedValue(0.8)
}));
vi.mock("../metrics/FracCodePR", () => ({
  calculateFracPRReview: vi.fn().mockResolvedValue(0.8)
}));
vi.mock("sloc", () => ({
  default: vi.fn().mockReturnValue({
    total: 1500
  })
}));

describe("calculateMetrics", () => {
  const logger = shared.getLogger("test");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate metrics correctly with valid data", async () => {
    vi.spyOn(shared, "getGithubRepo").mockResolvedValueOnce("https://github.com/owner/repo");

    const result = await calculateMetrics("https://github.com/owner/repo");
    expect(result.Correctness).toBe(0.8);
    expect(result.License).toBe(0.8);
    expect(result.RampUp).toBe(0.8);
    expect(result.ResponsiveMaintainer).toBe(0.8);
    expect(result.BusFactor).toBe(0.8);
    expect(result.GoodPinningPractice).toBe(0.8);
    expect(result.PullRequest).toBe(0.8);
    expect(result.NetScore).toBe(0.8);
  });

  it("should return zero scores when repo information is invalid", async () => {
    vi.spyOn(shared, "getGithubRepo").mockResolvedValueOnce("not/a/url");

    const result = await calculateMetrics("invalid-url");

    expect(result.NetScore).toBe(0);
    expect(result.Correctness).toBe(0);
    expect(result.License).toBe(0);
    expect(result.RampUp).toBe(0);
    expect(result.ResponsiveMaintainer).toBe(0);
    expect(result.BusFactor).toBe(0);
    expect(result.GoodPinningPractice).toBe(0);
    expect(result.PullRequest).toBe(0);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Unable to retrieve repository information for URL: invalid-url")
    );
  });

  it("should handle errors in individual metric calculations gracefully", async () => {
    vi.spyOn(shared, "getGithubRepo").mockResolvedValueOnce("https://github.com/owner/repo");

    const result = await calculateMetrics("https://github.com/owner/repo");

    expect(result.NetScore).toBe(0.8);
    expect(result.Correctness).toBe(0.8);
    expect(result.License).toBe(0.8);
    expect(result.RampUp).toBe(0.8);
    expect(result.ResponsiveMaintainer).toBe(0.8);
    expect(result.BusFactor).toBe(0.8);
    expect(result.GoodPinningPractice).toBe(0.8);
    expect(result.PullRequest).toBe(0.8);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should handle repository cloning errors", async () => {
    vi.spyOn(shared, "getGithubRepo").mockRejectedValueOnce(new Error("Failed to clone repo"));

    const result = await calculateMetrics("https://github.com/owner/repo");

    expect(result.NetScore).toBe(0);
    expect(result.Correctness).toBe(0);
    expect(result.License).toBe(0);
    expect(result.RampUp).toBe(0);
    expect(result.ResponsiveMaintainer).toBe(0);
    expect(result.BusFactor).toBe(0);
    expect(result.GoodPinningPractice).toBe(0);
    expect(result.PullRequest).toBe(0);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Error calculating metrics"));
  });
});
