import { describe, it, expect, vi, Mock } from "vitest";
import { calculateResponsiveMaintainer } from "../metrics/ResponsiveMaintainer";
import { getGitHubData } from "../graphql";
import * as shared from "@package-rater/shared";

vi.mock("../graphql", () => ({
  getGitHubData: vi.fn()
}));
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

describe("calculateResponsiveMaintainer", () => {
  const logger = shared.getLogger("test");
  it("should calculate responsiveness correctly when issues exist", async () => {
    const mockRepoResponse = {
      data: {
        repository: {
          diskUsage: 120
        }
      }
    };

    const mockIssueResponse = {
      data: {
        repository: {
          issues: {
            edges: [
              {
                node: {
                  createdAt: "2023-01-01T00:00:00Z",
                  comments: {
                    edges: [
                      {
                        node: {
                          createdAt: "2023-01-05T00:00:00Z"
                        }
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockRepoResponse); // Mock repo query
    (getGitHubData as Mock).mockResolvedValueOnce(mockIssueResponse); // Mock issues query

    const result = await calculateResponsiveMaintainer("test-owner", "test-repo");

    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Responsiveness for test-owner\/test-repo: \d+(\.\d+)?$/)
    );
  });

  it("should return 0.5 when no issues are found", async () => {
    const mockRepoResponse = {
      data: {
        repository: {
          diskUsage: 30
        }
      }
    };

    const mockIssueResponse = {
      data: {
        repository: {
          issues: {
            edges: []
          }
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockRepoResponse); // Mock repo query
    (getGitHubData as Mock).mockResolvedValueOnce(mockIssueResponse); // Mock issues query

    const result = await calculateResponsiveMaintainer("test-owner", "test-repo");

    expect(result).toBe(0.5);

    const logger = shared.getLogger("test");
    expect(logger.info).toHaveBeenCalledWith("No issues found");
  });

  it("should throw an error when API call fails", async () => {
    const mockError = new Error("GitHub API failed");
    (getGitHubData as Mock).mockRejectedValueOnce(mockError);

    const logger = shared.getLogger("test");

    await expect(calculateResponsiveMaintainer("test-owner", "test-repo")).rejects.toThrow("GitHub API failed");

    expect(logger.error).toHaveBeenCalledWith("Error fetching data from GitHub API: GitHub API failed");
  });
});
