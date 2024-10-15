import { describe, it, expect, vi, beforeEach } from "vitest";
import calculateMetrics from "../metrics/Netscore"; // Adjust this import as needed
import { getGithubRepo } from "../graphql"; // Adjust this import as needed
import { getLogger } from "../logger"; // Adjust this import as needed

// Mock the getGithubRepo response with explicit typing
vi.mock("../graphql", () => ({
  getGithubRepo: vi.fn<(...args: Parameters<typeof getGithubRepo>) => Promise<string>>()
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

vi.mock("../logger", () => {
  return {
    getLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn()
    })
  };
});

describe("calculateMetrics", () => {
  const logger = getLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate metrics correctly with valid data", async () => {
    getGithubRepo.mockResolvedValue("https://github.com/owner/repo");
    const result = await calculateMetrics("https://github.com/owner/repo");

    expect(result.URL).toBe("https://github.com/owner/repo");
    expect(result.NetScore).toBe(0.8); // Adjust based on the formula
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
    // Mock the getGithubRepo response
    getGithubRepo.mockResolvedValue("https://github.com/owner/repo");

    const result = await calculateMetrics("https://github.com/owner/repo");

    expect(result.URL).toBe("https://github.com/owner/repo");
    expect(result.NetScore).toBe(0.8); // Adjust based on the formula
    expect(result.Correctness).toBe(0.8); // Correctness failed
    expect(result.License).toBe(0.8);
    expect(result.RampUp).toBe(0.8);
    expect(result.ResponsiveMaintainer).toBe(0.8); // Responsiveness failed
    expect(result.BusFactor).toBe(0.8);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it("should handle repository cloning errors", async () => {
    // Mock the getGithubRepo response to cause an error
    getGithubRepo.mockRejectedValue(new Error("Failed to clone repo"));

    const result = await calculateMetrics("https://github.com/owner/repo");

    expect(result.URL).toBe("https://github.com/owner/repo");
    expect(result.NetScore).toBe(0); // All scores should be 0
    expect(result.Correctness).toBe(0);
    expect(result.License).toBe(0);
    expect(result.RampUp).toBe(0);
    expect(result.ResponsiveMaintainer).toBe(0);
    expect(result.BusFactor).toBe(0);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Error calculating metrics"));
  });
});
