import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql.js";

const logger = getLogger("cli");

type IssuesData = {
  data: {
    repository: {
      issues: {
        totalCount: number;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
      closedIssues: {
        totalCount: number;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
      bugIssues: {
        totalCount: number;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    };
  };
};

async function fetchIssues(owner: string, repo: string): Promise<IssuesData> {
  let totalIssues = 0;
  let totalClosedIssues = 0;
  let totalBugIssues = 0;
  let afterCursor: string | null = null;
  let hasNextPage = true;

  try {
    while (hasNextPage) {
      const query = `
        query($owner: String!, $repo: String!, $after: String) {
          repository(owner: $owner, name: $repo) {
            issues(first: 100, after: $after) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
            }
            closedIssues: issues(states: CLOSED, first: 100, after: $after) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
            }
            bugIssues: issues(labels: ["type: bug"], first: 100, after: $after) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `;

      const variables = { owner, repo, after: afterCursor };
      const result = (await getGitHubData(repo, owner, query, variables)) as IssuesData;

      // Accumulate the totals
      totalIssues += result.data.repository.issues.totalCount;
      totalClosedIssues += result.data.repository.closedIssues.totalCount;
      totalBugIssues += result.data.repository.bugIssues.totalCount;

      // Update pagination state
      hasNextPage = result.data.repository.issues.pageInfo.hasNextPage;
      afterCursor = result.data.repository.issues.pageInfo.endCursor;
    }

    logger.info(`Fetched issues for ${owner}/${repo}: ${totalIssues} issues.`);
    return {
      data: {
        repository: {
          issues: { totalCount: totalIssues, pageInfo: { hasNextPage: false, endCursor: null } },
          closedIssues: { totalCount: totalClosedIssues, pageInfo: { hasNextPage: false, endCursor: null } },
          bugIssues: { totalCount: totalBugIssues, pageInfo: { hasNextPage: false, endCursor: null } }
        }
      }
    };
  } catch (error) {
    logger.error(`Error fetching issues for ${owner}/${repo}:`, error);
    return {
      data: {
        repository: {
          issues: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null } },
          closedIssues: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null } },
          bugIssues: { totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null } }
        }
      }
    };
  }
}

export async function calculateLOC(owner: string, repo: string): Promise<number> {
  try {
    type TreeEntry = {
      name: string;
      type: string;
      object?: {
        text?: string;
        entries?: TreeEntry[];
      };
    };

    type RepositoryData = {
      data: {
        repository: {
          object?: {
            entries?: TreeEntry[];
          };
        };
      };
    };

    const query = `{
      repository(owner: "${owner}", name: "${repo}") {
        object(expression: "HEAD:") {
          ... on Tree {
            entries {
              name
              type
              object {
                ... on Blob {
                  text
                }
                ... on Tree {
                  entries {
                    name
                    type
                    object {
                      ... on Blob {
                        text
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`;
    const result = (await getGitHubData(repo, owner, query)) as RepositoryData;

    let totalLines = 0;
    function countLines(text: string) {
      return text.split("\n").length;
    }

    function traverseTree(entries: TreeEntry[]) {
      if (!entries) return;
      entries.forEach((entry: TreeEntry) => {
        if (entry.type === "blob" && entry.object && entry.object.text) {
          totalLines += countLines(entry.object.text);
        } else if (entry.type === "tree" && entry.object && entry.object.entries) {
          traverseTree(entry.object.entries); // Recursively traverse subdirectories
        }
      });
    }

    if (result.data.repository.object && result.data.repository.object.entries) {
      traverseTree(result.data.repository.object.entries);
    } else {
      logger.error("No entries found in the repository object.");
    }

    logger.info(`Fetched LOC for ${owner}/${repo}: ${totalLines} lines.`);
    return totalLines;
  } catch (error) {
    logger.error(`Error calculating LOC for ${owner}/${repo}:`, error);
    return 0;
  }
}

export async function calculateCorrectness(owner: string, repo: string, totalLinesOfCode: number) {
  const issuesData = await fetchIssues(owner, repo);
  const totalIssues = issuesData.data.repository.issues.totalCount;
  const resolvedIssues = issuesData.data.repository.closedIssues.totalCount;
  const totalBugs = issuesData.data.repository.bugIssues.totalCount;

  if (totalLinesOfCode === 0) {
    logger.info(`No LOC found for ${owner}/${repo}`);
    return 0;
  }

  const resolvedIssuesRatio = totalIssues > 0 ? resolvedIssues / totalIssues : 1;
  const normalizedBugRatio = totalLinesOfCode > 0 ? totalBugs / totalLinesOfCode : 0;

  // Adjust weights as needed
  const correctness = 0.7 * resolvedIssuesRatio + 0.3 * (1 - normalizedBugRatio);
  logger.info(`Correctness for ${owner}/${repo}:`, correctness);
  return correctness;
}
