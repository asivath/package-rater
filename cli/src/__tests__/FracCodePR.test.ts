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

  it("should calculate PR review fraction correctly", async () => {
    const mockCommitData = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                },
                nodes: [
                  {
                    additions: 100,
                    deletions: 50,
                    associatedPullRequests: {
                      nodes: [
                        {
                          reviewDecision: "APPROVED"
                        }
                      ]
                    }
                  },
                  {
                    additions: 200,
                    deletions: 100,
                    associatedPullRequests: {
                      nodes: []
                    }
                  },
                  {
                    additions: 150,
                    deletions: 75,
                    associatedPullRequests: {
                      nodes: [
                        {
                          reviewDecision: null
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      }
    };

    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce(mockCommitData);

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    // Calculations:
    // Total lines changed = (100 - 50) + (200 - 100) + (150 - 75) = 225
    // Lines from reviewed commits = (100 - 50) = 50
    // Expected fraction = 50 / 225 ≈ 0.2222

    expect(fracPRReview).toBeCloseTo(50 / 225);
  });

  it("should return 0 when no commits are associated with reviewed PRs", async () => {
    const mockCommitData = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                },
                nodes: [
                  {
                    additions: 100,
                    deletions: 50,
                    associatedPullRequests: {
                      nodes: []
                    }
                  },
                  {
                    additions: 200,
                    deletions: 100,
                    associatedPullRequests: {
                      nodes: []
                    }
                  },
                  {
                    additions: 150,
                    deletions: 75,
                    associatedPullRequests: {
                      nodes: []
                    }
                  }
                ]
              }
            }
          }
        }
      }
    };

    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce(mockCommitData);

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    expect(fracPRReview).toBe(0);
  });

  it("should not exceed fraction of 1 when reviewed lines changed exceed total lines changed", async () => {
    const mockCommitData = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                },
                nodes: [
                  {
                    additions: 50,
                    deletions: 100,
                    associatedPullRequests: {
                      nodes: []
                    }
                  },
                  {
                    additions: 100,
                    deletions: 150,
                    associatedPullRequests: {
                      nodes: []
                    }
                  },
                  {
                    additions: 200,
                    deletions: 50,
                    associatedPullRequests: {
                      nodes: [
                        {
                          reviewDecision: "APPROVED"
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      }
    };

    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce(mockCommitData);

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    // Calculations:
    // Total lines changed = (-50) + (-50) + (200 - 50) = 100
    // Lines from reviewed commits = 200 - 50 = 150
    // Expected fraction = 150 / 100 = 1 (clamped between 0 and 1)

    expect(fracPRReview).toBe(1);
  });

  it("should return 0 when total lines changed is zero", async () => {
    const mockCommitData = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                },
                nodes: [
                  {
                    additions: 100,
                    deletions: 100,
                    associatedPullRequests: {
                      nodes: [
                        {
                          reviewDecision: "APPROVED"
                        }
                      ]
                    }
                  },
                  {
                    additions: 200,
                    deletions: 200,
                    associatedPullRequests: {
                      nodes: [
                        {
                          reviewDecision: "APPROVED"
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      }
    };

    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce(mockCommitData);

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    expect(fracPRReview).toBe(0);
  });

  it("should handle pagination correctly", async () => {
    const mockCommitDataPage1 = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: true,
                  endCursor: "cursor1"
                },
                nodes: [
                  {
                    additions: 100,
                    deletions: 50,
                    associatedPullRequests: {
                      nodes: [
                        {
                          reviewDecision: "APPROVED"
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      }
    };

    const mockCommitDataPage2 = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                },
                nodes: [
                  {
                    additions: 200,
                    deletions: 100,
                    associatedPullRequests: {
                      nodes: []
                    }
                  }
                ]
              }
            }
          }
        }
      }
    };

    vi.mocked(getGitHubData as Mock)
      .mockResolvedValueOnce(mockCommitDataPage1)
      .mockResolvedValueOnce(mockCommitDataPage2);

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    // Calculations:
    // Total lines changed = (100 - 50) + (200 - 100) = 150
    // Lines from reviewed commits = (100 - 50) = 50
    // Expected fraction = 50 / 150 ≈ 0.3333

    expect(fracPRReview).toBeCloseTo(50 / 150);
  });

  it("should return 0 when no commits are found", async () => {
    const mockCommitData = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                },
                nodes: []
              }
            }
          }
        }
      }
    };

    vi.mocked(getGitHubData as Mock).mockResolvedValueOnce(mockCommitData);

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    expect(fracPRReview).toBe(0);
  });

  it("should try master branch if main branch has no commits", async () => {
    const mockMainBranchData = {
      data: {
        repository: {
          ref: null
        }
      }
    };

    const mockMasterBranchData = {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                },
                nodes: [
                  {
                    additions: 100,
                    deletions: 50,
                    associatedPullRequests: {
                      nodes: [
                        {
                          reviewDecision: "APPROVED"
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      }
    };

    vi.mocked(getGitHubData as Mock).mockImplementation((repo, owner, query, variables) => {
      if (variables.branch === "main") {
        return Promise.resolve(mockMainBranchData);
      } else if (variables.branch === "master") {
        return Promise.resolve(mockMasterBranchData);
      } else {
        return Promise.reject(new Error("Unknown branch"));
      }
    });

    const fracPRReview = await calculateFracPRReview("owner", "repo");

    // Calculations:
    // Total lines changed = 100 - 50 = 50
    // Lines from reviewed commits = 50
    // Expected fraction = 50 / 50 = 1

    expect(fracPRReview).toBe(1);
  });
});
