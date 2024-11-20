import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql";
import { calculateCorrectness } from "../metrics/Correctness";
import * as util from "util";

vi.mock("@package-rater/shared", () => {
  return {
    getLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn()
    })
  };
});
vi.mock("../graphql", () => ({
  getGitHubData: vi.fn()
}));
vi.mock("util", () => ({
  promisify: vi.fn(() => {
    return vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        JavaScript: { code: 1000 },
        TypeScript: { code: 500 },
      })
    });
  })
}));

describe("calculateCorrectness", () => {
  const logger = getLogger("test");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate correctness correctly when there are issues and LOC", async () => {
    const mockIssuesData = {
      data: {
        repository: {
          issues: { totalCount: 10 },
          closedIssues: { totalCount: 7 },
          bugIssues: { totalCount: 3 }
        }
      }
    };
    (getGitHubData as Mock).mockResolvedValueOnce(mockIssuesData);

    const correctness = await calculateCorrectness("owner", "repo", "repoDir");

    expect(correctness).toBeCloseTo(0.7 * (7 / 10) + 0.3 * (1 - 3 / 1500));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Correctness for owner/repo"));
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
    (getGitHubData as Mock).mockResolvedValueOnce(mockIssuesData);
    vi.mocked(util.promisify).mockImplementationOnce(() => {
      return vi.fn().mockResolvedValue({
        stdout: JSON.stringify({})
      });
    });

    const correctness = await calculateCorrectness("owner", "repo", "repoDir");

    expect(correctness).toBe(0);
    expect(logger.info).toHaveBeenCalledWith("No LOC found for owner/repo");
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
    (getGitHubData as Mock).mockResolvedValueOnce(mockIssuesData);
    vi.mocked(util.promisify).mockImplementationOnce(() => {
      return vi.fn().mockRejectedValue(new Error("Network Error"));
    });

    const correctness = await calculateCorrectness("owner", "repo", "repoDir");

    expect(correctness).toBe(0);
    expect(logger.error).toHaveBeenCalledWith("Error calculating LOC for repoDir: Network Error");
  });
});
