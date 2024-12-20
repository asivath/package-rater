/**
 * This file clones and calculates lines of codes for a repository
 * and calculates the metrics for the repository
 */
import { getLogger, getGithubRepo, cloneRepo, Ndjson, assertIsNdjson } from "@package-rater/shared";
import { calculateCorrectness } from "./Correctness.js";
import { calculateLicense } from "./License.js";
import { calculateRampup } from "./RampUp.js";
import { calculateResponsiveMaintainer } from "./ResponsiveMaintainer.js";
import { calculateBusFactor } from "./BusFactor.js";
import { calculatePinnedDependencyFraction } from "./Dependencies.js";
import { rm } from "fs/promises";
import { calculateFracPRReview } from "./FracCodePR.js";
import { readdir, readFile } from "fs/promises";
import path from "path";
import sloc from "sloc";

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

/**
 * Calculate the lines of code for a repository using sloc
 * @param repoDir
 * @returns
 */
export async function calculateLOC(repoDir: string): Promise<number> {
  try {
    const readDirectory = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        entries.map((entry) => {
          const fullPath = path.resolve(dir, entry.name);
          return entry.isDirectory() ? readDirectory(fullPath) : [fullPath];
        })
      );
      return files.flat();
    };
    // Read all files in the repository directory
    const allFiles = await readDirectory(repoDir);
    const jsTsFiles = allFiles.filter((file) => /\.(js|jsx|ts|tsx)$/.test(path.extname(file)));
    let totalLines = 0;
    // Calculate the lines of code for each JavaScript/TypeScript file
    for (const file of jsTsFiles) {
      const content = await readFile(file, "utf-8");
      const stats = sloc(content, path.extname(file).slice(1));
      totalLines += stats.total;
    }

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
    // Calculate the total lines of code in the repository
    const totalLinesOfCode = await calculateLOC(repoDir);
    const end = new Date();
    const setupTime = (end.getTime() - start.getTime()) / 1000;
    // Start bus factor promise first because the api can respond with 202 (accepted) and take a while to calculate
    const busFactorPromise = latencyWrapper(() => calculateBusFactor(repoOwner, repoName, totalLinesOfCode));

    const [busFactor, correctness, licenseCompatibility, responsiveness, rampUp, dependencies, fracPR] =
      await Promise.all([
        busFactorPromise,
        latencyWrapper(() => calculateCorrectness(repoOwner, repoName, totalLinesOfCode)),
        latencyWrapper(() => calculateLicense(repoOwner, repoName, repoDir)),
        latencyWrapper(() => calculateResponsiveMaintainer(repoOwner, repoName)),
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
      BusFactorLatency: parseFloat(busFactor.time.toFixed(2)),
      Correctness: parseFloat(correctness.result.toFixed(2)),
      CorrectnessLatency: parseFloat(correctness.time.toFixed(2)),
      RampUp: parseFloat(rampUp.result.toFixed(2)),
      RampUpLatency: parseFloat(rampUp.time.toFixed(2)),
      ResponsiveMaintainer: parseFloat(responsiveness.result.toFixed(2)),
      ResponsiveMaintainerLatency: parseFloat(responsiveness.time.toFixed(2)),
      LicenseScore: parseFloat(licenseCompatibility.result.toFixed(2)),
      LicenseScoreLatency: parseFloat(licenseCompatibility.time.toFixed(2)),
      GoodPinningPractice: parseFloat(dependencies.result.toFixed(2)),
      GoodPinningPracticeLatency: parseFloat(dependencies.time.toFixed(2)),
      PullRequest: parseFloat(fracPR.result.toFixed(2)),
      PullRequestLatency: parseFloat(fracPR.time.toFixed(2)),
      NetScore: parseFloat(netscore.toFixed(2)),
      NetScoreLatency: parseFloat(
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
      BusFactorLatency: 0,
      Correctness: 0,
      CorrectnessLatency: 0,
      RampUp: 0,
      RampUpLatency: 0,
      ResponsiveMaintainer: 0,
      ResponsiveMaintainerLatency: 0,
      LicenseScore: 0,
      LicenseScoreLatency: 0,
      GoodPinningPractice: 0,
      GoodPinningPracticeLatency: 0,
      PullRequest: 0,
      PullRequestLatency: 0,
      NetScore: 0,
      NetScoreLatency: 0
    };
    assertIsNdjson(ndjson);
    return ndjson;
  }
}
