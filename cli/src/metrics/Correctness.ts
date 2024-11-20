import { getLogger } from "@package-rater/shared";
import { getGitHubData } from "../graphql.js";
import { promisify } from "util";
import { exec } from "child_process";

const logger = getLogger("cli");

type IssuesData = {
  data: {
    repository: {
      issues: {
        totalCount: number;
      };
      closedIssues: {
        totalCount: number;
      };
      bugIssues: {
        totalCount: number;
      };
    };
  };
};

async function fetchIssues(owner: string, repo: string): Promise<IssuesData> {
  try {
    const query = `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) { 
            issues {
              totalCount
            }
            closedIssues: issues(states: CLOSED) {
              totalCount
            }
            bugIssues: issues(first: 5, labels: ["type: bug"]) {
              totalCount
            }
          }
        }
      `;

    const result = await getGitHubData(repo, owner, query);
    logger.info(`Fetched issues for ${owner}/${repo}: ${JSON.stringify(result)}`);
    return result as IssuesData;
  } catch (error) {
    logger.error(`Error fetching issues for ${owner}/${repo}: ${(error as Error).message}`);
    return {
      data: { repository: { issues: { totalCount: 0 }, closedIssues: { totalCount: 0 }, bugIssues: { totalCount: 0 } } }
    };
  }
}

async function calculateLOC(repoDir: string): Promise<number> {
  try {
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(`npx cloc --json ${repoDir}`);
    const clocData = JSON.parse(stdout);
    const jsLines = clocData.JavaScript?.code || 0;
    const tsLines = clocData.TypeScript?.code || 0;
    const totalLines = jsLines + tsLines;
    logger.info(`Calculated LOC for ${repoDir}: ${totalLines}`);
    return totalLines;
  } catch (error) {
    logger.error(`Error calculating LOC for ${repoDir}: ${(error as Error).message}`);
    return 0;
  }
}

/**
 * Calculate the correctness of a repository based on resolved issues and bugs
 * @param owner
 * @param repo
 * @param repoDir
 * @returns
 */
export async function calculateCorrectness(owner: string, repo: string, repoDir?: string): Promise<number> {
  if (!repoDir) {
    logger.error("Repository directory is not defined");
    return 0;
  }
  const issuesData = await fetchIssues(owner, repo);
  const totalLinesOfCode = await calculateLOC(repoDir);
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
  logger.info(`Correctness for ${owner}/${repo}: ${correctness}`);
  return correctness;
}
