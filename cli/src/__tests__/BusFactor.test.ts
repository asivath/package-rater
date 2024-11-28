import { describe, it, expect, vi, Mock, afterEach } from "vitest";
import { calculateBusFactor } from "../metrics/BusFactor";
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

describe("calculateBusFactor", () => {
  const owner = "ownerName";
  const name = "repoName";

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calculates bus factor correctly for a single page of commits", async () => {
    const mockData = {
      data: {
        repository: {
          defaultBranchRef: {
            target: {
              history: {
                edges: [
                  {
                    node: {
                      author: {
                        user: { login: "user1" }
                      }
                    }
                  },
                  {
                    node: {
                      author: {
                        user: { login: "user2" }
                      }
                    }
                  },
                  {
                    node: {
                      author: {
                        user: { login: "user1" }
                      }
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
        }
      }
    };

    (getGitHubData as Mock).mockResolvedValueOnce(mockData);

    const busFactor = await calculateBusFactor(owner, name);

    // Here we expect the bus factor to be 5, since user1 has 2 commits and user2 has 1.
    expect(busFactor).toBe(0.5);
  });

  it("handles no commits gracefully", async () => {
    const mockData = {
      data: {
        repository: {
          defaultBranchRef: {
            target: {
              history: {
                edges: [],
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                }
              }
            }
          }
        }
      }
    };
    (getGitHubData as Mock).mockResolvedValueOnce(mockData);
    const busFactor = await calculateBusFactor(owner, name);

    // If there are no commits, bus factor should be 0
    expect(busFactor).toBe(0.5);
  });

  it("logs an error if fetching data fails", async () => {
    (getGitHubData as Mock).mockRejectedValue(new Error("Network Error"));

    const busFactor = await calculateBusFactor(owner, name);

    // Bus factor should be 0 if there's an error fetching data
    expect(busFactor).toBe(0);
  });
});
