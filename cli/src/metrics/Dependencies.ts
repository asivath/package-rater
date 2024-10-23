import fs from "fs/promises";
import path from "path";
import { getLogger } from "@package-rater/shared";

const logger = getLogger("Dependencies");

/**
 * Check if a version string is pinned to a specific major.minor version.
 * @param versionConstraint The version constraint string.
 * @returns True if pinned to a major.minor version, false otherwise.
 */
export function isPinnedToMajorMinor(versionConstraint: string): boolean {
  console.log("Version Constraint: ", versionConstraint);
  // Reject versions with caret (^)
  if (versionConstraint.startsWith("^")) {
    return false;
  }
  const majorMinorRegex = /^(\d+)\.(\d+)(?:\.\d+)?$/;
  return majorMinorRegex.test(versionConstraint);
}

/**
 * Recursively find all package.json files in the cloned repository
 * @param dir The directory to search within
 * @returns An array of paths to package.json files
 */
export async function findPackageJsonFiles(dir: string): Promise<string[]> {
  const packageJsonFiles: string[] = [];
  const traverseDir = async (currentDir: string) => {
    try {
      const files = await fs.readdir(currentDir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(currentDir, file.name);
        if (file.isDirectory()) {
          await traverseDir(fullPath); // Recurse into directories
        } else if (file.isFile() && file.name === "package.json") {
          packageJsonFiles.push(fullPath); // Found a package.json
        }
      }
    } catch (error) {
      logger.error(`Error reading directory ${currentDir}:`, error);
    }
  };

  await traverseDir(dir);
  return packageJsonFiles;
}

/**
 * Clone a repository, find all package.json files, and calculate the fraction of pinned dependencies
 * @param owner The owner of the repository
 * @param repo The name of the repository
 * @returns The fraction of pinned dependencies (0.0 to 1.0)
 */
export async function calculatePinnedDependencyFraction(
  owner: string,
  repo: string,
  repoDir: string | null
): Promise<number> {
  if (!repoDir) {
    logger.error("Repository directory is not defined");
    return 0;
  }

  // Find all package.json files in the cloned repository
  let totalDependencies = 0;
  let pinnedDependencies = 0;
  let packageJsonFiles: string[] = [];
  try {
    packageJsonFiles = await findPackageJsonFiles(repoDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(`Error reading package.json for ${owner}/${repo}:`, error);
    }
  }

  for (const packageJsonPath of packageJsonFiles) {
    try {
      console.log("PackageJsonPath: ", packageJsonPath);
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.optionalDependencies
      };
      // Iterate through dependencies and check if they are pinned
      for (const [, versionConstraint] of Object.entries(dependencies)) {
        totalDependencies++;
        if (typeof versionConstraint == "string" && isPinnedToMajorMinor(versionConstraint)) {
          pinnedDependencies++;
        }
      }
    } catch (error) {
      logger.error(`Failed to read or parse package.json at ${packageJsonPath}:`, error);
    }
  }

  // If no dependencies were found, return 1.0 (fully pinned)
  if (totalDependencies === 0) {
    return 1.0;
  }

  // Calculate the fraction of pinned dependencies
  return (totalDependencies - pinnedDependencies) / totalDependencies;
}
