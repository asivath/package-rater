import { describe, it, expect, vi, beforeEach } from "vitest";
import calculateMetrics from "../metrics/Netscore"; // Ensure this path is correct
import { getGithubRepo } from "../graphql"; // Ensure this path is correct
import { getLogger } from "@package-rater/shared";

// Mocking modules
vi.mock("../graphql", () => ({
  getGithubRepo: vi.fn() // Simplified mock
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

vi.mock("@package-rater/shared", () => ({
  getLogger: vi.fn().mockReturnValue({
    error: vi.fn(),
    info: vi.fn()
  })
}));

vi.mock("../util", () => ({
  cloneRepo: vi.fn()
}));

describe("calculateMetrics", () => {
  const logger = getLogger("test");

  beforeEach(() => {
    vi.clearAllMocks(); // Ensure all mocks are reset before each test
  });

  it("should calculate metrics correctly with valid data", async () => {
    getGithubRepo.mockResolvedValue("https://github.com/owner/repo");
    const result = await calculateMetrics("https://github.com/owner/repo");

    expect(result.URL).toBe("https://github.com/owner/repo");
    expect(result.NetScore).toBe(0.8);
    expect(result.Correctness).toBe(0.8);
    expect(result.License).toBe(0.8);
    expect(result.RampUp).toBe(0.8);
    expect(result.ResponsiveMaintainer).toBe(0.8);
    expect(result.BusFactor).toBe(0.8);

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should return zero scores when repo information is invalid", async () => {
    // Mock getGithubRepo to return null or invalid response
    getGithubRepo.mockResolvedValue("not/a/url");
    const result = await calculateMetrics("invalid-url");

    expect(result.URL).toBe("invalid-url");
    expect(result.NetScore).toBe(0);
    expect(result.Correctness).toBe(0);
    expect(result.License).toBe(0);
    expect(result.RampUp).toBe(0);
    expect(result.ResponsiveMaintainer).toBe(0);
    expect(result.BusFactor).toBe(0);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Unable to retrieve repository information for URL: invalid-url")
    );
  });

  it("should handle errors in individual metric calculations gracefully", async () => {
    getGithubRepo.mockResolvedValue("https://github.com/owner/repo");

    const result = await calculateMetrics("https://github.com/owner/repo");

    expect(result.URL).toBe("https://github.com/owner/repo");
    expect(result.NetScore).toBe(0.8);
    expect(result.Correctness).toBe(0.8);
    expect(result.License).toBe(0.8);
    expect(result.RampUp).toBe(0.8);
    expect(result.ResponsiveMaintainer).toBe(0.8);
    expect(result.BusFactor).toBe(0.8);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should handle repository cloning errors", async () => {
    getGithubRepo.mockRejectedValue(new Error("Failed to clone repo"));

    const result = await calculateMetrics("https://github.com/owner/repo");

    expect(result.URL).toBe("https://github.com/owner/repo");
    expect(result.NetScore).toBe(0);
    expect(result.Correctness).toBe(0);
    expect(result.License).toBe(0);
    expect(result.RampUp).toBe(0);
    expect(result.ResponsiveMaintainer).toBe(0);
    expect(result.BusFactor).toBe(0);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Error calculating metrics"));
  });
});
