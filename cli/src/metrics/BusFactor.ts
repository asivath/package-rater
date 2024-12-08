/**
 * Calculate the bus factor for a GitHub repository by using the Gini coefficient
 */
import { getLogger } from "@package-rater/shared";

const logger = getLogger("cli");

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Contributor = {
  author: {
    login: string | null;
  };
  total: number;
};

/**
 * Fetch contributor stats for a GitHub repository
 * @param owner The repository owner
 * @param repo The repository name
 * @returns The contributor stats
 */
async function fetchContributorStats(owner: string, repo: string): Promise<Contributor[] | null> {
  const maxRetries = 10;
  const delay = 3000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/stats/contributors`, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "User-Agent": "bus-factor-calc",
        Accept: "application/vnd.github.v3+json"
      }
    });

    // If the response is 202, the stats are not ready yet
    if (response.status === 202) {
      if (attempt < maxRetries - 1) {
        logger.warn(`Contributor stats not ready yet. Waiting ${delay / 1000}s before retry...`);
        await sleep(delay);
      } else {
        logger.error("Contributor stats not ready after waiting ~30s. Try again later.");
        return null;
      }
      continue;
    }

    if (!response.ok) {
      logger.error(`Failed to fetch contributor stats: ${response.statusText}`);
      return [];
    }

    const contributors = (await response.json()) as Contributor[];
    return Array.isArray(contributors) ? contributors : [];
  }

  return null;
}

/**
 * Calculate the Gini coefficient for a set of values. The Gini coefficient is a measure of inequality.
 * @param values The values to calculate the Gini coefficient for
 * @returns The Gini coefficient
 */
function calculateGiniCoefficient(values: number[]): number {
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0; // If no commits, Gini is 0
  // Sort the values in ascending order
  const sorted = [...values].sort((a, b) => a - b);
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }

  const G = numerator / (n * sum);
  return G;
}

/**
 * Calculate the desired bus factor for a given lines of code (LOC) count. Scale the desired bus factor based on the LOC.
 * @param loc The lines of code
 * @returns The desired bus factor
 */
function desiredBusFactorForLOC(loc: number): number {
  if (loc < 1000) {
    return 2;
  }
  const factor = Math.floor(Math.log10(loc / 1000));
  return 2 + factor;
}

/**
 * Calculate the bus factor for a GitHub repository
 * @param owner The repository owner
 * @param repo The repository name
 * @param loc The lines of code
 * @returns The calculated bus factor
 */
export async function calculateBusFactor(owner: string, repo: string, loc: number): Promise<number> {
  const contributors = await fetchContributorStats(owner, repo);
  if (contributors === null) {
    logger.info(`Contributor stats for ${owner}/${repo} not ready. Returning 0.`);
    return 0;
  }
  if (contributors.length === 0) {
    logger.info(`No contributors found for ${owner}/${repo}. Returning 0.`);
    return 0;
  }

  const commitCounts = contributors.filter((c) => c.author && c.author.login).map((c) => c.total);

  if (commitCounts.length === 0) {
    logger.info(`No commit data found for ${owner}/${repo}. Returning 0.`);
    return 0;
  }

  // Calculate the desired bus factor based on the lines of code
  // If the repository has fewer contributors than the desired bus factor, return 0
  const desired = desiredBusFactorForLOC(loc);
  const totalContributors = commitCounts.length;
  if (totalContributors < desired) {
    logger.info(`Total contributors (${totalContributors}) is less than desired (${desired}). Returning 0.`);
    return 0;
  }

  const gini = calculateGiniCoefficient(commitCounts);
  let score = 1 - gini;
  score = Math.min(1, score * 4);

  logger.info(
    `Bus factor for ${owner}/${repo}: ${score.toFixed(2)}, desired: ${desired}, contributors: ${totalContributors}`
  );
  return score;
}
