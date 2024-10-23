import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql.js";

const logger = getLogger("cli");

const GET_PR_COMMITS_QUERY = `
query GetPRCommits($owner: String!, $repo: String!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(states: MERGED, baseRefName: "main", first: 50, after: $after) {
      nodes {
        number
        commits(first: 50) {
          nodes {
            commit {
              oid
              additions
              deletions
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}

`;

const GET_MAIN_COMMITS_QUERY = `
query GetMainCommits($owner: String!, $repo: String!, $after: String) {
  repository(owner: $owner, name: $repo) {
    ref(qualifiedName: "refs/heads/main") {
      target {
        ... on Commit {
          history(first: 50, after: $after) {
            nodes {
              oid
              additions
              deletions
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  }
}
`;

type PRCommitsData = {
  data: {
    repository: {
      pullRequests: {
        nodes: Array<{
          number: number;
          commits: {
            nodes: Array<{
              commit: {
                oid: string;
                additions: number;
                deletions: number;
              };
            }>;
          };
        }>;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
};

type MainCommitsData = {
  data: {
    repository: {
      ref: {
        target: {
          history: {
            nodes: Array<{
              oid: string;
              additions: number;
              deletions: number;
            }>;
            pageInfo: {
              hasNextPage: boolean;
              endCursor: string | null;
            };
          };
        };
      };
    };
  };
};

async function fetchAllPRCommits(owner: string, repo: string): Promise<Set<string>> {
  let hasNextPage = true;
  let after: string | undefined = undefined;
  const prCommitSet = new Set<string>();

  while (hasNextPage) {
    const data = (await getGitHubData(repo, owner, GET_PR_COMMITS_QUERY, { after })) as PRCommitsData;

    const pullRequests = data.data.repository.pullRequests;

    pullRequests.nodes.forEach((pr) => pr.commits.nodes.forEach((commit) => prCommitSet.add(commit.commit.oid)));

    hasNextPage = pullRequests.pageInfo.hasNextPage;
    after = pullRequests.pageInfo.endCursor ?? undefined;

    logger.info(`Fetched PR commits, next page: ${hasNextPage}, cursor: ${after}`);
  }

  return prCommitSet;
}

async function fetchAllMainCommits(
  owner: string,
  repo: string
): Promise<Array<{ oid: string; additions: number; deletions: number }>> {
  let hasNextPage = true;
  let after: string | undefined = undefined;
  const mainCommits: Array<{ oid: string; additions: number; deletions: number }> = [];

  while (hasNextPage) {
    const data = (await getGitHubData(repo, owner, GET_MAIN_COMMITS_QUERY, { after })) as MainCommitsData;

    const history = data.data.repository.ref.target.history;

    history.nodes.forEach((commit) =>
      mainCommits.push({
        oid: commit.oid,
        additions: commit.additions,
        deletions: commit.deletions
      })
    );

    hasNextPage = history.pageInfo.hasNextPage;
    after = history.pageInfo.endCursor ?? undefined;

    logger.info(`Fetched main commits, next page: ${hasNextPage}, cursor: ${after}`);
  }

  return mainCommits;
}

export async function calculatePRImpact(owner: string, repo: string): Promise<number> {
  try {
    const prCommits = await fetchAllPRCommits(owner, repo);
    logger.info("successfully fetched PR commits");
    const mainCommits = await fetchAllMainCommits(owner, repo);
    logger.info("successfully fetched main commits");

    let prTotal = 0;
    let mainTotal = 0;

    mainCommits.forEach(({ oid, additions, deletions }) => {
      if (prCommits.has(oid)) {
        prTotal += additions + deletions;
      }
      mainTotal += additions + deletions;
    });

    const percentage = mainTotal > 0 ? prTotal / mainTotal : 0;

    logger.info(`Percentage of code changes via PRs: ${percentage.toFixed(2)}`);
    return percentage;
  } catch (error) {
    logger.error("Error calculating PR code percentage:", error);
  }
  return 0;
}
