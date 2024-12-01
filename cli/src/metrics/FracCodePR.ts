import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql.js";

const logger = getLogger("cli");

type PRNode = {
  number: number;
  additions: number;
  deletions: number;
  reviewDecision: string;
  comments: {
    totalCount: number;
  };
};

type PRResponse = {
  data: {
    repository: {
      pullRequests: {
        nodes: PRNode[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
};

// Fetch merged PRs for a specific branch (either 'main' or 'master')
async function fetchMergedPRs(owner: string, repo: string, baseRef: string): Promise<PRNode[]> {
  const query = `
    query GetPRSummary($owner: String!, $repo: String!, $baseRef: String!, $after: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(states: MERGED, baseRefName: $baseRef, first: 50, after: $after) {
          nodes {
            number
            additions
            deletions
            reviewDecision
            comments {
            totalCount
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

  const results: PRNode[] = [];
  let hasNextPage = true;
  let after: string | null = null;

  while (hasNextPage) {
    const data = (await getGitHubData(repo, owner, query, {
      baseRef,
      after
    })) as PRResponse;

    const { nodes, pageInfo } = data.data.repository.pullRequests;
    results.push(...nodes);

    hasNextPage = pageInfo.hasNextPage;
    after = pageInfo.endCursor ?? null;

    logger.info(`Fetched ${nodes.length} PRs. Next page: ${hasNextPage}`);
  }

  logger.info(`Total merged PRs fetched from ${baseRef} for ${repo}: ${results.length}`);
  return results;
}

// Fetch and combine merged PRs from both 'main' and 'master' branches
async function fetchAllMergedPRs(owner: string, repo: string): Promise<PRNode[]> {
  const [mainPRs, masterPRs] = await Promise.all([
    fetchMergedPRs(owner, repo, "main"),
    fetchMergedPRs(owner, repo, "master")
  ]);

  const allPRs = [...mainPRs, ...masterPRs];
  logger.info(`Total merged PRs from 'main' and 'master' for ${repo}: ${allPRs.length}`);
  return allPRs;
}

export async function calculateFracPRReview(owner: string, repo: string, tocMain: number): Promise<number> {
  try {
    // Fetch merged PRs from both 'main' and 'master' branches
    const mergedPRs = await fetchAllMergedPRs(owner, repo);

    // Filter PRs that have either a non-null reviewDecision OR at least 1 comment AND
    // the amount of code deleted is not more than added by 1.5x to deal with weird edge cases
    // where 1000000 lines are deleted and 1000 line is added, aka readME changes
    const validPRs = mergedPRs.filter(
      (pr) => (pr.reviewDecision !== null || pr.comments.totalCount > 0) && pr.deletions <= 1.5 * pr.additions
    );

    // Calculate the total LOC impact from valid PRs
    const prLOC = validPRs.reduce((total, pr) => total + (pr.additions - pr.deletions), 0);

    // Calculate the fraction of PR LOC relative to the total code in default branch
    logger.info(`PR Impact for ${repo}: ${prLOC} / ${tocMain}`);
    const fractionFromPR = tocMain > 0 ? prLOC / tocMain : 0;
    logger.info(`PR Impact for ${repo}: ${(fractionFromPR * 100).toFixed(2)}%`);
    return Math.max(0, Math.min(fractionFromPR, 1));
  } catch (error) {
    logger.error(`Error calculating PR impact for ${repo}:`, error);
    return 0;
  }
}