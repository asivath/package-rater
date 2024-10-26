import { getLogger } from "./logger.js";
import { SimpleGit, simpleGit } from "simple-git";
import path from "path";
import fs from "fs/promises";
import os from "os";

const logger = getLogger("util");

/**
 * Fetches the GitHub repository owner and package name from a provided URL (npm or GitHub)
 * @param url The URL to fetch the GitHub repository from
 * @returns The GitHub repository URL or null if an error occurred
 */
export async function getGithubRepo(url: string): Promise<string | null> {
  const trimmedUrl = url.trim();
  const npmRegex = /npmjs\.com\/package\/(?<packageName>[^/]+)/;
  const githubRegex = /github\.com\/(?<owner>[^/]+)\/(?<packageName>[^/]+)/;
  if (trimmedUrl.includes("npmjs.com")) {
    logger.info("Handling NPM URL");
    const npmMatch = trimmedUrl.match(npmRegex);
    if (!npmMatch?.groups?.packageName) {
      logger.info("Invalid NPM URL");
      return null;
    }
    const packageName = npmMatch.groups.packageName;
    try {
      const response = await fetch(`https://registry.npmjs.org/${packageName}`);
      const data = await response.json();

      let repoURL = data?.repository?.url;
      if (repoURL) {
        repoURL = repoURL.replace(/^git\+/, "").replace(/\.git$/, "");
        const githubMatch = repoURL.match(githubRegex);
        if (githubMatch?.groups) {
          logger.info(`Owner: ${githubMatch.groups.owner}, Package: ${githubMatch.groups.packageName}`);
          return `https://github.com/${githubMatch.groups.owner}/${githubMatch.groups.packageName}`;
        }
      }

      logger.error("No valid GitHub repository found in the NPM package");
    } catch (error) {
      logger.error(`Error fetching NPM package: ${error}`);
      return null;
    }
  }
  if (trimmedUrl.includes("github.com")) {
    return trimmedUrl;
  }
  logger.error("Invalid URL format");
  return null;
}

/**
 * Clone a repository from a given URL
 * @param repoUrl The URL of the repository to clone
 * @param repoName The name of the repository
 * @returns The path to the cloned repository or null if an error occurred
 */
export async function cloneRepo(repoUrl: string, repoName: string): Promise<string | null> {
  // Validate the file path directly
  const resolvedPath = path.resolve(repoName);
  if (!path.isAbsolute(resolvedPath) || repoName.includes("..")) {
    logger.info("Invalid file path");
    return null;
  }

  const git: SimpleGit = simpleGit();
  const repoDir = path.resolve(os.tmpdir(), repoName);

  try {
    // Clean up the directory if it exists to ensure a fresh clone
    await fs.rm(repoDir, { recursive: true, force: true });
    await fs.mkdir(repoDir, { recursive: true });
    // Clone the repository with a shallow clone for efficiency
    await git.clone(repoUrl, repoDir);
    logger.info(`Repository successfully cloned to ${repoDir}`);
    return repoDir;
  } catch (error) {
    logger.error(`Error cloning repository ${repoUrl}:`, error);
    return null;
  }
}
