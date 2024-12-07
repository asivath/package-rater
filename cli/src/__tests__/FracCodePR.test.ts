import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import { calculateFracPRReview } from "../metrics/FracCodePR";
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

describe("calculateFracPRReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate PR review fraction correctly with valid commits and reviews", async () => {
    // Mock GetDefaultBranch
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          defaultBranchRef: {
            name: "main"
          }
        }
      }
    });

    // Mock GetCommitCount (totalCommits = 3)
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                totalCount: 3
              }
            }
          }
        }
      }
    });

    // Mock GetCommits (fetch all 3 commits)
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: [
                  {
                    node: {
                      additions: 100,
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: "APPROVED"
                          }
                        ]
                      }
                    }
                  },
                  {
                    node: {
                      additions: 200,
                      associatedPullRequests: {
                        nodes: [] // no PR
                      }
                    }
                  },
                  {
                    node: {
                      additions: 150,
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: "CHANGES_REQUESTED"
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    });

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    // totalChanges = 100 + 200 + 150 = 450
    // reviewedChanges = only the commit with APPROVED PR = 100
    // fraction = 100 / 450 ≈ 0.2222
    expect(fracPRReview).toBeCloseTo(100 / 450);
  });

  it("should return 0 when no commits have approved PRs", async () => {
    // Mock GetDefaultBranch
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          defaultBranchRef: {
            name: "main"
          }
        }
      }
    });

    // Mock GetCommitCount (totalCommits = 3)
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                totalCount: 3
              }
            }
          }
        }
      }
    });

    // All commits have no APPROVED reviews
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: [
                  {
                    node: {
                      additions: 100,
                      associatedPullRequests: {
                        nodes: [] // no PR
                      }
                    }
                  },
                  {
                    node: {
                      additions: 200,
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: "CHANGES_REQUESTED"
                          }
                        ]
                      }
                    }
                  },
                  {
                    node: {
                      additions: 150,
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: "COMMENTED"
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    });

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    // totalChanges = 100 + 200 + 150 = 450
    // No APPROVED PR commits, reviewedChanges = 0
    // fraction = 0
    expect(fracPRReview).toBe(0);
  });

  it("should return 0 when total lines changed is zero", async () => {
    // Mock GetDefaultBranch
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          defaultBranchRef: {
            name: "main"
          }
        }
      }
    });

    // Mock GetCommitCount (totalCommits = 2)
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                totalCount: 2
              }
            }
          }
        }
      }
    });

    // Both commits have 0 additions
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: [
                  {
                    node: {
                      additions: 0,
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: "APPROVED"
                          }
                        ]
                      }
                    }
                  },
                  {
                    node: {
                      additions: 0,
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: "APPROVED"
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    });

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    // totalChanges = 0 + 0 = 0
    // reviewedChanges = 0 (even though approved, total changes = 0)
    // fraction = 0
    expect(fracPRReview).toBe(0);
  });

  it("should return 0 when no commits are found", async () => {
    // Mock GetDefaultBranch
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          defaultBranchRef: {
            name: "main"
          }
        }
      }
    });

    // Mock GetCommitCount (totalCommits = 0)
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                totalCount: 0
              }
            }
          }
        }
      }
    });

    // With 0 commits, no fetchCommits call is needed. If code attempts to fetch, return no edges
    // But let's assume code doesn't fetch if totalCount=0
    // If code does fetch anyway:
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: []
              }
            }
          }
        }
      }
    });

    const fracPRReview = await calculateFracPRReview("owner", "repo");
    expect(fracPRReview).toBe(0);
  });

  it("should correctly handle fetching newest and oldest commits when totalCommits > 600", async () => {
    // Mock GetDefaultBranch
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          defaultBranchRef: {
            name: "main"
          }
        }
      }
    });

    // Mock GetCommitCount (totalCommits = 700 > 600 threshold)
    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce({
      data: {
        repository: {
          ref: {
            target: {
              history: {
                totalCount: 700
              }
            }
          }
        }
      }
    });

    // Mock fetching newest 300 commits (page 1)
    const newestCommitsPage1 = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: true,
                  endCursor: "newestCursor1"
                },
                edges: Array(100)
                  .fill(null)
                  .map((_, index) => ({
                    node: {
                      additions: 100 + index, // Simulate unique additions
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: index % 2 === 0 ? "APPROVED" : "CHANGES_REQUESTED" // Alternate approvals
                          }
                        ]
                      }
                    }
                  }))
              }
            }
          }
        }
      }
    };

    const newestCommitsPage2 = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: "newestCursor2"
                },
                edges: Array(100)
                  .fill(null)
                  .map((_, index) => ({
                    node: {
                      additions: 200 + index, // Simulate unique additions
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: index % 2 === 0 ? "APPROVED" : "CHANGES_REQUESTED" // Alternate approvals
                          }
                        ]
                      }
                    }
                  }))
              }
            }
          }
        }
      }
    };

    // Mock fetching oldest 300 commits (page 1)
    const oldestCommitsPage1 = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: true,
                  endCursor: "oldestCursor1"
                },
                edges: Array(100)
                  .fill(null)
                  .map((_, index) => ({
                    node: {
                      additions: 300 + index, // Simulate unique additions
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: index % 2 === 0 ? "APPROVED" : "COMMENTED" // Alternate approvals
                          }
                        ]
                      }
                    }
                  }))
              }
            }
          }
        }
      }
    };

    const oldestCommitsPage2 = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                },
                edges: Array(100)
                  .fill(null)
                  .map((_, index) => ({
                    node: {
                      additions: 400 + index, // Simulate unique additions
                      associatedPullRequests: {
                        nodes: [
                          {
                            baseRefName: "main",
                            reviewDecision: index % 2 === 0 ? "APPROVED" : "CHANGES_REQUESTED" // Alternate approvals
                          }
                        ]
                      }
                    }
                  }))
              }
            }
          }
        }
      }
    };

    // Mock responses in sequence for fetchCommits calls
    vi.mocked(getGitHubData as Mock)
      .mockResolvedValueOnce(newestCommitsPage1) // Newest commits, page 1
      .mockResolvedValueOnce(newestCommitsPage2) // Newest commits, page 2
      .mockResolvedValueOnce(oldestCommitsPage1) // Oldest commits, page 1
      .mockResolvedValueOnce(oldestCommitsPage2); // Oldest commits, page 2

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    // Calculations:
    // - Total changes from newest commits = 300 commits with 100 additions each
    // - Total changes from oldest commits = 300 commits with 100 additions each
    // - APPROVED commits = (half of both newest and oldest commits are APPROVED)
    // Reviewed changes = 150 * 100 (newest) + 150 * 100 (oldest) = 30000
    // Total changes = 300 * 100 (newest) + 300 * 100 (oldest) = 60000
    // Fraction = 30000 / 60000 = 0.5

    expect(fracPRReview).toBeCloseTo(0.5);
  });
});
