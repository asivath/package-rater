/**
 * Calculate the fraction of code introduced through reviewed PRs.
 * Note, we cosider a PR is reviewed only if it is approved.
 * We also look at commits in the default branch of the repository and if it has an associated PRs.
 */

import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql.js";

const logger = getLogger("cli");

type CommitNode = {
  additions: number;
  associatedPullRequests: {
    nodes: {
      baseRefName: string;
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
            edges: {
              node: CommitNode;
            }[];
          };
        };
      };
    };
  };
};

/**
 * Fetch commits from a branch with pagination.
 * @param owner Repository owner
 * @param repo Repository name
 * @param branch Default branch name
 * @param totalCommits Number of commits to fetch
 * @param after Cursor for pagination
 * @returns Array of commit nodes
 */
async function fetchCommits(
  owner: string,
  repo: string,
  branch: string,
  totalCommits: number,
  after: string | null = null
): Promise<{ commits: CommitNode[]; endCursor: string | null; hasNextPage: boolean }> {
  const commitQuery = `
    query GetCommits($owner: String!, $repo: String!, $branch: String!, $first: Int!, $after: String) {
      repository(owner: $owner, name: $repo) {
        ref(qualifiedName: $branch) {
          target {
            ... on Commit {
              history(first: $first, after: $after) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                edges {
                  node {
                    additions
                    associatedPullRequests(first: 1) {
                      nodes {
                        baseRefName
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
    }
  `;

  const perPage = Math.min(totalCommits, 100);
  const data = (await getGitHubData(repo, owner, commitQuery, {
    branch,
    first: perPage,
    after
  })) as CommitResponse;

  const history = data.data.repository.ref?.target?.history;
  if (!history) {
    logger.error(`No commit history found for branch ${branch} in repo ${repo}`);
    return { commits: [], endCursor: null, hasNextPage: false };
  }

  const commits = history.edges.map((edge) => edge.node);
  const { hasNextPage, endCursor } = history.pageInfo;

  return { commits, endCursor, hasNextPage };
}

/**
 * Fetch commits from both the newest and oldest parts of the commit history.
 * @param owner Repository owner
 * @param repo Repository name
 * @param branch Default branch name
 * @param sampleSize Number of commits to fetch from each end
 * @returns Combined array of sampled commit nodes
 */
async function fetchOldestAndNewestCommits(
  owner: string,
  repo: string,
  branch: string,
  sampleSize: number
): Promise<CommitNode[]> {
  const newestCommits = await fetchCommits(owner, repo, branch, sampleSize);
  const oldestCommits: CommitNode[] = [];

  let currentCursor = newestCommits.endCursor;
  let hasNextPage = newestCommits.hasNextPage;

  while (hasNextPage) {
    const {
      commits,
      endCursor,
      hasNextPage: nextPage
    } = await fetchCommits(owner, repo, branch, sampleSize, currentCursor);
    oldestCommits.push(...commits);

    currentCursor = endCursor;
    hasNextPage = nextPage;

    if (oldestCommits.length >= sampleSize) {
      break;
    }
  }

  return [...newestCommits.commits, ...oldestCommits.slice(0, sampleSize)];
}

/**
 * Calculate the fraction of code introduced through reviewed PRs.
 * @param owner Repository owner
 * @param repo Repository name
 * @returns Fraction of code introduced via reviewed PRs
 */
export async function calculateFracPRReview(owner: string, repo: string): Promise<number> {
  try {
    // Fetch the default branch of the repository
    const branchQuery = `
      query GetDefaultBranch($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          defaultBranchRef {
            name
          }
        }
      }
    `;
    const branchData = (await getGitHubData(repo, owner, branchQuery)) as {
      data: {
        repository: {
          defaultBranchRef: {
            name: string;
          };
        };
      };
    };

    const defaultBranch = branchData.data.repository.defaultBranchRef?.name || "main";
    logger.info(`Default branch for ${repo}: ${defaultBranch}`);

    // Get total number of commits in the repository
    const totalCommitsQuery = `
      query GetCommitCount($owner: String!, $repo: String!, $branch: String!) {
        repository(owner: $owner, name: $repo) {
          ref(qualifiedName: $branch) {
            target {
              ... on Commit {
                history {
                  totalCount
                }
              }
            }
          }
        }
      }
    `;
    const totalCommitsData = (await getGitHubData(repo, owner, totalCommitsQuery, {
      branch: defaultBranch
    })) as {
      data: {
        repository: {
          ref: {
            target: {
              history: {
                totalCount: number;
              };
            };
          };
        };
      };
    };

    const totalCommits = totalCommitsData.data.repository.ref?.target?.history?.totalCount || 0;
    logger.info(`Total commits in default branch: ${totalCommits}`);

    // Decide on fetching strategy
    let commits: CommitNode[] = [];
    const commitLimit = 600;
    const sampleSize = 300;

    if (totalCommits <= commitLimit) {
      logger.info(`Fetching all ${totalCommits} commits from the default branch.`);
      commits = (await fetchCommits(owner, repo, defaultBranch, totalCommits)).commits;
    } else {
      logger.info(`Fetching ${sampleSize} newest and ${sampleSize} oldest commits.`);
      commits = await fetchOldestAndNewestCommits(owner, repo, defaultBranch, sampleSize);
    }

    // Calculate total code changes across all commits
    const totalChanges = commits.reduce((sum, commit) => sum + commit.additions, 0);

    // Calculate reviewed code changes
    const reviewedChanges = commits
      .filter((commit) =>
        commit.associatedPullRequests.nodes.some(
          (pr) => pr.baseRefName === defaultBranch && pr.reviewDecision === "APPROVED"
        )
      )
      .reduce((sum, commit) => sum + commit.additions, 0);

    logger.info(`Total lines changed in default branch: ${totalChanges}`);
    logger.info(`Reviewed lines changed: ${reviewedChanges}`);

    // Calculate the fraction
    const fraction = totalChanges > 0 ? reviewedChanges / totalChanges : 0;
    logger.info(`Fraction of code introduced through reviewed PRs: ${(fraction * 100).toFixed(2)}%`);
    return Math.max(0, Math.min(fraction, 1));
  } catch (error) {
    logger.error(`Error calculating fraction for ${repo}: ${error}`);
    return 0;
  }
}
