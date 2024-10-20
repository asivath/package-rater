import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import { getLogger } from "../logger";
import { getGitHubData } from "../graphql";
import { calculateCorrectness } from "../metrics/Correctness"; // Adjust the import path as necessary

// Mocking the logger
vi.mock("../logger", () => {
  return {
    getLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn()
    })
  };
});

// Mocking the getGitHubData function
vi.mock("../graphql", () => ({
  getGitHubData: vi.fn()
}));

describe("calculateCorrectness", () => {
  const logger = getLogger("test");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate correctness correctly when there are issues and LOC", async () => {
    // Mocking the GitHub data response for issues
    const mockIssuesData = {
      data: {
        repository: {
          issues: { totalCount: 10 },
          closedIssues: { totalCount: 7 },
          bugIssues: { totalCount: 3 }
        }
      }
    };

    // Mocking the GitHub data response for LOC
    const mockLOCData = {
      data: {
        repository: {
          object: {
            entries: [
              {
                name: "file1.js",
                type: "blob",
                object: { text: "line1\nline2\n" }
              },
              {
                name: "folder",
                type: "tree",
                object: {
                  entries: [
                    {
                      name: "file2.js",
                      type: "blob",
                      object: { text: "line1\n" }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockIssuesData); // Mock for fetchIssues
    (getGitHubData as Mock).mockResolvedValueOnce(mockLOCData); // Mock for calculateLOC

    const correctness = await calculateCorrectness("owner", "repo");

    expect(correctness).toBeCloseTo(0.7 * (7 / 10) + 0.3 * (1 - 3 / 5)); // Adjusted for the mock data
    expect(logger.info).toHaveBeenCalledWith(`Correctness for owner/repo:`, expect.any(Number));
  });

  it("should handle the case with no lines of code", async () => {
    const mockIssuesData = {
      data: {
        repository: {
          issues: { totalCount: 0 },
          closedIssues: { totalCount: 0 },
          bugIssues: { totalCount: 0 }
        }
      }
    };

    // Mocking LOC data to have no entries
    const mockLOCData = {
      data: {
        repository: {
          object: {
            entries: []
          }
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockIssuesData); // Mock for fetchIssues
    (getGitHubData as Mock).mockResolvedValueOnce(mockLOCData); // Mock for calculateLOC

    const correctness = await calculateCorrectness("owner", "repo");

    expect(correctness).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(`No LOC found for owner/repo`);
  });

  it("should return 0 for errors in fetching issues", async () => {
    (getGitHubData as Mock).mockRejectedValueOnce(new Error("Network Error")); // Simulate fetchIssues error
    (getGitHubData as Mock).mockResolvedValueOnce({ data: { repository: { object: { entries: [] } } } }); // Mock LOC response

    const correctness = await calculateCorrectness("owner", "repo");

    expect(correctness).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(`Error fetching issues for owner/repo:`, expect.any(Error));
  });

  it("should return 0 for errors in calculating LOC", async () => {
    const mockIssuesData = {
      data: {
        repository: {
          issues: { totalCount: 1 },
          closedIssues: { totalCount: 1 },
          bugIssues: { totalCount: 1 }
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockIssuesData); // Mock for fetchIssues
    (getGitHubData as Mock).mockRejectedValueOnce(new Error("Network Error")); // Simulate LOC calculation error

    const correctness = await calculateCorrectness("owner", "repo");

    expect(correctness).toBe(0); // Since there was an error calculating LOC
    expect(logger.error).toHaveBeenCalledWith(`Error calculating LOC for owner/repo:`, expect.any(Error));
  });
});
