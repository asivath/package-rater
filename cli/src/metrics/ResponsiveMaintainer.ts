/**
 * This module calculates the responsiveness score for a repository on GitHub
 */
import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql.js";

const logger = getLogger("cli");

const issues_query = `
  query($owner: String!, $name: String!, $first: Int!) {
    repository(owner: $owner, name: $name) {
      issues(first: $first) {
        edges {
          node {
            state
            createdAt
            closedAt
            comments(first: 1) {
              edges {
                node {
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  }
`;

type Issue = {
  node: {
    state: string;
    createdAt: string;
    closedAt: string | null;
    comments: {
      edges: {
        node: {
          createdAt: string;
        };
      }[];
    };
  };
};

type IssueQueryResponse = {
  data: {
    repository: {
      issues: {
        edges: Issue[];
      };
    };
  };
};

/**
 * Fetches the responsiveness score for a repository on GitHub. The responsiveness score is calculated based on the average response time and the closure rate of issues.
 * @param owner The owner of the repository
 * @param name The name of the repository
 * @returns The responsiveness score for the repository
 */
export async function calculateResponsiveMaintainer(owner: string, name: string): Promise<number> {
  const responseTimes: number[] = [];
  let closedIssuesCount = 0;
  let totalIssuesCount = 0;

  try {
    const issue_result = (await getGitHubData(name, owner, issues_query, {
      owner,
      name,
      first: 100
    })) as IssueQueryResponse;

    const issues: Issue[] = issue_result.data.repository.issues.edges;

    if (issues.length === 0) {
      logger.info("No issues found");
      return 0.5;
    }

    totalIssuesCount = issues.length;
    issues.forEach((issue: Issue) => {
      const createdAt: Date = new Date(issue.node.createdAt);
      const firstComment = issue.node.comments.edges[0];
      if (firstComment) {
        const firstResponseAt: Date = new Date(firstComment.node.createdAt);
        const responseTime: number = (firstResponseAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        responseTimes.push(responseTime);
      }
      if (issue.node.state === "CLOSED") {
        closedIssuesCount++;
      }
    });

    const avgResponseTime =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : Number.MAX_VALUE;

    const responseTimeScore = Math.max(0, 1 - avgResponseTime / 30);

    const closureRate = closedIssuesCount / totalIssuesCount;
    const closureRateScore = closureRate;

    const responseWeight = 0.2;
    const closureRateWeight = 0.8;
    const responsivenessScore = responseWeight * responseTimeScore + closureRateWeight * closureRateScore;

    logger.info(`Responsiveness for ${owner}/${name}: ${responsivenessScore}`);
    return responsivenessScore;
  } catch (error) {
    logger.error(`Error fetching data from GitHub API: ${(error as Error).message}`);
    throw error;
  }
}
