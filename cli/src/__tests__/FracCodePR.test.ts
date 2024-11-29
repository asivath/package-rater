import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import { calculateFracPRReview } from "../metrics/FracCodePR";
import { getGitHubData } from "../graphql";

vi.mock("../graphql", () => ({
  getGitHubData: vi.fn()
}));

describe("calculateFracPRReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate PR review fraction correctly", async () => {
    const mockPRData = {
      data: {
        repository: {
          pullRequests: {
            nodes: [
              {
                number: 1,
                additions: 100,
                deletions: 100,
                reviewDecision: "APPROVED",
                comments: {
                  totalCount: 5
                }
              },
              {
                number: 2,
                additions: 300,
                deletions: 200,
                reviewDecision: "CHANGES_REQUESTED",
                comments: {
                  totalCount: 10
                }
              }
            ],
            pageInfo: {
              hasNextPage: false,
              endCursor: null
            }
          }
        }
      }
    };
    const tocMain = 1000;
    vi.mocked(getGitHubData as Mock)
      .mockResolvedValueOnce(mockPRData)
      .mockResolvedValueOnce(mockPRData);

    const fracPRReview = await calculateFracPRReview("owner", "repo", tocMain);

    expect(fracPRReview).toBe(0.2);
  });

  it("should handle the case with no PRs", async () => {
    const mockPRData = {
      data: {
        repository: {
          pullRequests: {
            nodes: [],
            pageInfo: {
              hasNextPage: false,
              endCursor: null
            }
          }
        }
      }
    };
    const tocMain = 200;
    (getGitHubData as Mock).mockResolvedValueOnce(mockPRData);

    const fracPRReview = await calculateFracPRReview("owner", "repo", tocMain);

    expect(fracPRReview).toBe(0);
  });

  it("should not include PRs with too much deletetion", async () => {
    const mockPRData = {
      data: {
        repository: {
          pullRequests: {
            nodes: [
              {
                number: 1,
                additions: 100,
                deletions: 10000,
                reviewDecision: "APPROVED",
                comments: {
                  totalCount: 5
                }
              },
              {
                number: 2,
                additions: 400,
                deletions: 200,
                reviewDecision: "CHANGES_REQUESTED",
                comments: {
                  totalCount: 10
                }
              }
            ],
            pageInfo: {
              hasNextPage: false,
              endCursor: null
            }
          }
        }
      }
    };
    const tocMain = 1000;
    vi.mocked(getGitHubData as Mock)
      .mockResolvedValueOnce(mockPRData)
      .mockResolvedValueOnce(mockPRData);

    const fracPRReview = await calculateFracPRReview("owner", "repo", tocMain);

    expect(fracPRReview).toBe(0.4);
  });

  it("should not go into negatives", async () => {
    const mockPRData = {
      data: {
        repository: {
          pullRequests: {
            nodes: [
              {
                number: 1,
                additions: 100,
                deletions: 10000,
                reviewDecision: "APPROVED",
                comments: {
                  totalCount: 5
                }
              },
              {
                number: 2,
                additions: 400,
                deletions: 500,
                reviewDecision: "CHANGES_REQUESTED",
                comments: {
                  totalCount: 10
                }
              }
            ],
            pageInfo: {
              hasNextPage: false,
              endCursor: null
            }
          }
        }
      }
    };
    const tocMain = 1000;
    vi.mocked(getGitHubData as Mock)
      .mockResolvedValueOnce(mockPRData)
      .mockResolvedValueOnce(mockPRData);

    const fracPRReview = await calculateFracPRReview("owner", "repo", tocMain);

    expect(fracPRReview).toBe(0);
  });

  it("should allow more deletion than addition if deletion < 1.5 x addition", async () => {
    const mockPRData = {
      data: {
        repository: {
          pullRequests: {
            nodes: [
              {
                number: 1,
                additions: 100,
                deletions: 150,
                reviewDecision: "APPROVED",
                comments: {
                  totalCount: 5
                }
              },
              {
                number: 2,
                additions: 400,
                deletions: 300,
                reviewDecision: "CHANGES_REQUESTED",
                comments: {
                  totalCount: 10
                }
              }
            ],
            pageInfo: {
              hasNextPage: false,
              endCursor: null
            }
          }
        }
      }
    };
    const tocMain = 1000;
    vi.mocked(getGitHubData as Mock)
      .mockResolvedValueOnce(mockPRData)
      .mockResolvedValueOnce(mockPRData);

    const fracPRReview = await calculateFracPRReview("owner", "repo", tocMain);

    expect(fracPRReview).toBe(0.1);
  });
});
