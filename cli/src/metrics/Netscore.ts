import { getLogger, getGithubRepo, cloneRepo, Ndjson, assertIsNdjson } from "@package-rater/shared";
import { calculateCorrectness } from "./Correctness.js";
import { calculateLicense } from "./License.js";
import { calculateRampup } from "./RampUp.js";
import { calculateResponsiveMaintainer } from "./ResponsiveMaintainer.js";
import { calculateBusFactor } from "./BusFactor.js";
import { calculatePinnedDependencyFraction } from "./Dependencies.js";
import { rm } from "fs/promises";
import { promisify } from "util";
import { exec } from "child_process";
import { calculateFracPRReview } from "./FracCodePR.js";

const logger = getLogger("cli");

/**
 * Calculate the score of a function and return the score and latency
 * @param calculateFn The function to calculate the score
 * @returns The score and latency
 */
async function latencyWrapper(calculateFn: () => Promise<number>): Promise<{ result: number; time: number }> {
  const startTime = Date.now();
  try {
    const result = await calculateFn();
    const endTime = Date.now();
    const time = (endTime - startTime) / 1000;
    return { result, time };
  } catch (error) {
    logger.info(`Error calculating score: ${error}`);
    const endTime = Date.now();
    const time = (endTime - startTime) / 1000;
    return { result: 0, time: time };
  }
}

/**
 * Get the owner and repository name from a GitHub URL
 * @param url The GitHub URL
 * @returns The owner and repository name
 * Note that getGithubRepo will return same url if it is a GitHub URL,
 * otherwise it will convert NPM url to GitHub URL
 */
async function getRepoOwner(url: string): Promise<[string, string, string] | null> {
  try {
    const response = await getGithubRepo(url);
    if (response) {
      const cleanUrl = response.replace(/^git\+/, "").replace(/\.git$/, "");
      const urlObj = new URL(cleanUrl);
      const pathnameParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathnameParts.length === 2) {
        return [pathnameParts[1], pathnameParts[0], cleanUrl];
      } else {
        logger.error(`Invalid package URL: ${response}`);
        throw new Error(`Invalid package URL: ${response}`);
      }
    }
  } catch (error) {
    logger.info(`Error fetching package info for ${url}: ${(error as Error).message}`);
  }
  return null;
}

export async function calculateLOC(repoDir: string): Promise<number> {
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
 * Calculate the metrics for a package or repository
 * @param url The original URL of the package
 * @returns The metrics for the package or repository
 */
export default async function calculateMetrics(url: string): Promise<Ndjson> {
  try {
    const repoInfo = await getRepoOwner(url);
    if (!repoInfo) {
      throw new Error(`Unable to retrieve repository information for URL: ${url}`);
    }
    const [repoName, repoOwner, gitUrl] = repoInfo;
    const start = new Date();
    const repoDir = await cloneRepo(gitUrl, repoName);
    if (!repoDir) {
      throw new Error(`Repository directory is undefined for URL: ${url}`);
    }
    const totalLinesOfCode = await calculateLOC(repoDir);
    const end = new Date();
    const setupTime = (end.getTime() - start.getTime()) / 1000;
    const [correctness, licenseCompatibility, responsiveness, busFactor, rampUp, dependencies, fracPR] =
      await Promise.all([
        latencyWrapper(() => calculateCorrectness(repoOwner, repoName, totalLinesOfCode)),
        latencyWrapper(() => calculateLicense(repoOwner, repoName, repoDir)),
        latencyWrapper(() => calculateResponsiveMaintainer(repoOwner, repoName)),
        latencyWrapper(() => calculateBusFactor(repoOwner, repoName)),
        latencyWrapper(() => calculateRampup(repoOwner, repoName)),
        latencyWrapper(() => calculatePinnedDependencyFraction(repoOwner, repoName, repoDir)),
        latencyWrapper(() => calculateFracPRReview(repoOwner, repoName))
      ]);

    const netscore =
      0.1 * busFactor.result +
      0.2 * correctness.result +
      0.1 * rampUp.result +
      0.15 * responsiveness.result +
      0.2 * licenseCompatibility.result +
      0.1 * dependencies.result +
      0.15 * fracPR.result;

    logger.info(`Calculated NetScore for ${repoOwner}/${repoName}: ${netscore}`);

    const ndjsonOutput: Ndjson = {
      BusFactor: parseFloat(busFactor.result.toFixed(2)),
      BusFactor_Latency: parseFloat(busFactor.time.toFixed(2)),
      Correctness: parseFloat(correctness.result.toFixed(2)),
      Correctness_Latency: parseFloat(correctness.time.toFixed(2)),
      RampUp: parseFloat(rampUp.result.toFixed(2)),
      RampUp_Latency: parseFloat(rampUp.time.toFixed(2)),
      ResponsiveMaintainer: parseFloat(responsiveness.result.toFixed(2)),
      ResponsiveMaintainer_Latency: parseFloat(responsiveness.time.toFixed(2)),
      License: parseFloat(licenseCompatibility.result.toFixed(2)),
      License_Latency: parseFloat(licenseCompatibility.time.toFixed(2)),
      GoodPinningPractice: parseFloat(dependencies.result.toFixed(2)),
      GoodPinningPracticeLatency: parseFloat(dependencies.time.toFixed(2)),
      PullRequest: parseFloat(fracPR.result.toFixed(2)),
      PullRequest_Latency: parseFloat(fracPR.time.toFixed(2)),
      NetScore: parseFloat(netscore.toFixed(2)),
      NetScore_Latency: parseFloat(
        (
          correctness.time +
          licenseCompatibility.time +
          rampUp.time +
          responsiveness.time +
          busFactor.time +
          dependencies.time +
          fracPR.time +
          setupTime
        ).toFixed(2)
      )
    };
    assertIsNdjson(ndjsonOutput);
    if (repoDir) await rm(repoDir, { recursive: true });

    return ndjsonOutput;
  } catch (error) {
    logger.error(`Error calculating metrics: ${error}`);
    const ndjson: Ndjson = {
      BusFactor: 0,
      BusFactor_Latency: 0,
      Correctness: 0,
      Correctness_Latency: 0,
      RampUp: 0,
      RampUp_Latency: 0,
      ResponsiveMaintainer: 0,
      ResponsiveMaintainer_Latency: 0,
      License: 0,
      License_Latency: 0,
      GoodPinningPractice: 0,
      GoodPinningPracticeLatency: 0,
      PullRequest: 0,
      PullRequest_Latency: 0,
      NetScore: 0,
      NetScore_Latency: 0
    };
    assertIsNdjson(ndjson);
    return ndjson;
  }
}
