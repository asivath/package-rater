import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql.js";

const logger = getLogger("cli");

type CommitNode = {
  additions: number;
  deletions: number;
  associatedPullRequests: {
    nodes: {
      reviewDecision: string;
    }[];
  };
};

type CommitResponse = {
  data: {
    repository: {
      ref: {
        target: {
          history: {
            pageInfo: {
              hasNextPage: boolean;
              endCursor: string | null;
            };
            nodes: CommitNode[];
          };
        };
      };
    };
  };
};

async function fetchCommitsWithPRs(
  owner: string,
  repo: string,
  branch: string,
  totalCommits: number
): Promise<CommitNode[]> {
  const query = `
    query GetCommitsWithPRs($owner: String!, $repo: String!, $branch: String!, $first: Int!, $after: String) {
      repository(owner: $owner, name: $repo) {
        ref(qualifiedName: $branch) {
          target {
            ... on Commit {
              history(first: $first, after: $after) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  additions
                  deletions
                  associatedPullRequests(first: 1) {
                    nodes {
                      reviewDecision
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const results: CommitNode[] = [];
  let hasNextPage = true;
  let after: string | null = null;
  const perPage = 100;
  let fetchedCommits = 0;

  while (hasNextPage && fetchedCommits < totalCommits) {
    const remainingCommits = totalCommits - fetchedCommits;
    const first = remainingCommits < perPage ? remainingCommits : perPage;

    const data = (await getGitHubData(repo, owner, query, {
      branch,
      first,
      after
    })) as CommitResponse;

    const history = data.data.repository.ref?.target?.history;
    if (!history) {
      logger.error(`No commit history found for branch ${branch} in repo ${repo}`);
      break;
    }

    const { nodes, pageInfo } = history;

    results.push(...nodes);
    fetchedCommits += nodes.length;

    hasNextPage = pageInfo.hasNextPage && fetchedCommits < totalCommits;
    after = pageInfo.endCursor ?? null;

    logger.info(`Fetched ${nodes.length} PRs. Next page: ${hasNextPage}`);
  }

  logger.info(`Total commits fetched from ${branch} for ${repo}: ${results.length}`);
  return results;
}

export async function calculateFracPRReview(owner: string, repo: string): Promise<number> {
  try {
    const totalCommits = 100;
    // Attempt to fetch commits from 'main' branch, else 'master' if 'main' doesn't exist
    let commits = await fetchCommitsWithPRs(owner, repo, "main", totalCommits);
    if (commits.length === 0) {
      commits = await fetchCommitsWithPRs(owner, repo, "master", totalCommits);
    }

    if (commits.length === 0) {
      logger.error(`No commits found in 'main' or 'master' branches for ${repo}`);
      return 0;
    }

    // Calculate total additions and deletions for all commits
    const totalAdditions = commits.reduce((sum, commit) => sum + commit.additions, 0);
    const totalDeletions = commits.reduce((sum, commit) => sum + commit.deletions, 0);
    const totalLinesChanged = totalAdditions - totalDeletions;

    // Filter commits that are part of a PR with a review decision
    const reviewedCommits = commits.filter((commit) => {
      const pr = commit.associatedPullRequests.nodes[0];
      return pr && pr.reviewDecision !== null;
    });

    // Calculate total additions and deletions for reviewed commits
    const reviewedAdditions = reviewedCommits.reduce((sum, commit) => sum + commit.additions, 0);
    const reviewedDeletions = reviewedCommits.reduce((sum, commit) => sum + commit.deletions, 0);
    const reviewedLinesChanged = reviewedAdditions - reviewedDeletions;

    logger.info(`Total lines changed in last ${commits.length} commits: ${totalLinesChanged}`);
    logger.info(`Total lines changed in reviewed PR commits: ${reviewedLinesChanged}`);

    const fraction = totalLinesChanged !== 0 ? reviewedLinesChanged / totalLinesChanged : 0;

    logger.info(`Fraction of code introduced through reviewed PRs: ${(fraction * 100).toFixed(2)}%`);

    return Math.max(0, Math.min(fraction, 1));
  } catch (error) {
    logger.error(`Error calculating PR impact for ${repo}:`, error);
    return 0;
  }
}
