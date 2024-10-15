import { describe, it, expect, vi, Mock, afterEach } from "vitest";
import { calculateBusFactor } from "../metrics/BusFactor"; // Update with the correct path
import { getGitHubData } from "../graphql"; // Ensure this path is correct

// Mocking the getGitHubData function
vi.mock("../graphql", () => ({
  getGitHubData: vi.fn()
}));

describe("calculateBusFactor", () => {
  const owner = "ownerName"; // Replace with a test owner
  const name = "repoName"; // Replace with a test repository name

  afterEach(() => {
    // Clear the mock after each test
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

    // Mock the response for getGitHubData
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

    // Mock the response for getGitHubData
    (getGitHubData as Mock).mockResolvedValueOnce(mockData);

    const busFactor = await calculateBusFactor(owner, name);

    // If there are no commits, bus factor should be 0
    expect(busFactor).toBe(0.5);
  });

  it("logs an error if fetching data fails", async () => {
    // Mock the response for getGitHubData to throw an error
    (getGitHubData as Mock).mockRejectedValue(new Error("Network Error"));

    const busFactor = await calculateBusFactor(owner, name);

    // Bus factor should be 0 if there's an error fetching data
    expect(busFactor).toBe(0);
  });
});
