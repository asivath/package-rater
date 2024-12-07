import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 0.5 when no issues are found", async () => {
    const mockNoIssuesResponse = {
      data: {
        repository: {
          issues: {
            edges: []
          }
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockNoIssuesResponse);

    const result = await calculateResponsiveMaintainer("test-owner", "test-repo");

    expect(result).toBe(0.5);
    expect(logger.info).toHaveBeenCalledWith("No issues found");
  });

  it("should calculate responsiveness score based on response time and closure rate", async () => {
    const mockIssuesResponse = {
      data: {
        repository: {
          issues: {
            edges: [
              {
                node: {
                  state: "CLOSED",
                  createdAt: "2023-12-01T00:00:00Z",
                  closedAt: "2023-12-02T00:00:00Z",
                  comments: {
                    edges: [
                      {
                        node: {
                          createdAt: "2023-12-01T12:00:00Z"
                        }
                      }
                    ]
                  }
                }
              },
              {
                node: {
                  state: "OPEN",
                  createdAt: "2023-12-01T00:00:00Z",
                  closedAt: null,
                  comments: {
                    edges: [
                      {
                        node: {
                          createdAt: "2023-12-01T15:00:00Z"
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

    (getGitHubData as Mock).mockResolvedValueOnce(mockIssuesResponse);

    const result = await calculateResponsiveMaintainer("test-owner", "test-repo");

    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Responsiveness for test-owner\/test-repo: \d+(\.\d+)?$/)
    );
  });

  it("should handle issues with no comments gracefully", async () => {
    const mockNoCommentsResponse = {
      data: {
        repository: {
          issues: {
            edges: [
              {
                node: {
                  state: "CLOSED",
                  createdAt: "2023-12-01T00:00:00Z",
                  closedAt: "2023-12-02T00:00:00Z",
                  comments: {
                    edges: []
                  }
                }
              }
            ]
          }
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockNoCommentsResponse);

    const result = await calculateResponsiveMaintainer("test-owner", "test-repo");

    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("should handle pagination and calculate responsiveness score across multiple pages", async () => {
    const mockIssues = {
      data: {
        repository: {
          issues: {
            edges: [
              {
                node: {
                  state: "CLOSED",
                  createdAt: "2023-12-01T00:00:00Z",
                  closedAt: "2023-12-02T00:00:00Z",
                  comments: {
                    edges: [
                      {
                        node: {
                          createdAt: "2023-12-01T12:00:00Z"
                        }
                      }
                    ]
                  }
                }
              }
            ],
            pageInfo: {
              hasNextPage: true,
              endCursor: "cursor1"
            }
          }
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockIssues);

    const result = await calculateResponsiveMaintainer("test-owner", "test-repo");

    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Responsiveness for test-owner\/test-repo: \d+(\.\d+)?$/)
    );
  });

  it("should throw an error when the API call fails", async () => {
    const mockError = new Error("GitHub API failed");

    (getGitHubData as Mock).mockRejectedValueOnce(mockError);

    await expect(calculateResponsiveMaintainer("test-owner", "test-repo")).rejects.toThrow("GitHub API failed");

    expect(logger.error).toHaveBeenCalledWith("Error fetching data from GitHub API: GitHub API failed");
  });
});
