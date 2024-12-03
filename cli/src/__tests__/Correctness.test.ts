import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql";
import { calculateCorrectness } from "../metrics/Correctness";
import * as shared from "@package-rater/shared";

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
vi.mock("../graphql", () => ({
  getGitHubData: vi.fn()
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

    const correctness = await calculateCorrectness("owner", "repo", 1500);

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

    const correctness = await calculateCorrectness("owner", "repo", 0);

    expect(correctness).toBe(0);
    expect(logger.info).toHaveBeenCalledWith("No LOC found for owner/repo");
  });
});
