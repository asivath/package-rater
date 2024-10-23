import { getLogger } from "./logger.js";
import { SimpleGit, simpleGit } from "simple-git";
import path from "path";
import fs from "fs/promises";
import os from "os";

const logger = getLogger("shared");

/**
 * Fetches the GitHub repository URL from the provided URL
 * @param url The URL to fetch the GitHub repository from
 * @returns The GitHub repository URL
 */
export async function getGithubRepo(url: string): Promise<string> {
  // Check if the provided URL is a GitHub URL
  const githubRegex = /^(https?:\/\/)?(www\.)?github\.com\/.+\/.+/;
  if (githubRegex.test(url)) {
    // It's a GitHub URL, return it as-is
    return url;
  }

  // Otherwise, assume it's an npm URL and fetch the GitHub URL from npm registry
  const npmRegex = /^https?:\/\/(www\.)?npmjs\.com\/package\/(.+)$/;
  const match = url.match(npmRegex);
  if (match) {
    const packageName = match[2]; // Extract the package name from the npm URL
    const npmUrl = `https://registry.npmjs.org/${packageName}`;
    try {
      const response = await fetch(npmUrl);
      if (!response.ok) {
        throw new Error(`Error fetching package info: ${response.statusText}`);
      }
      const data = await response.json();
      const latestVersion = data["dist-tags"].latest;
      const latestVersionData = data.versions[latestVersion];

      // Check for the GitHub repository in the package data
      let gitHubAPI = latestVersionData.repository && latestVersionData.repository.url;
      if (gitHubAPI) {
        gitHubAPI = gitHubAPI
        .replace(/^git\+/, "")
        .replace(/^git:\/\//, "https://")
        .replace(/\.git$/, "");

      if (!gitHubAPI.startsWith("https://")) {
        gitHubAPI = `https://${gitHubAPI}`;
      }
        return gitHubAPI;
      } else {
        logger.error("No GitHub repository found");
        throw new Error("No GitHub repository found");
      }
    } catch (error) {
      logger.error("Error fetching package info:", error);
      throw error;
    }
  }

  // If the URL is neither a GitHub URL nor an npm URL
  logger.error("Invalid URL: Not a GitHub or npm URL");
  throw new Error("Invalid URL: Not a GitHub or npm URL");
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
    await git.clone(repoUrl, repoDir, ["--depth", "1"]);
    logger.info(`Repository successfully cloned to ${repoDir}`);
    return repoDir;
  } catch (error) {
    logger.error(`Error cloning repository ${repoUrl}:`, error);
    return null;
  }
}
