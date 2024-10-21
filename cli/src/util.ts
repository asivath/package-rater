/**
 * Utility functions for the application. These functions are used to clone repositories and validate file paths.
 */
import { SimpleGit, simpleGit } from "simple-git";
import path from "path";
import { getLogger } from "@package-rater/shared";
import fs from "fs/promises";
import os from "os";

const logger = getLogger("cli");

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
