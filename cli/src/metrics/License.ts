/**
 * Calculate the license score by checking LICENSE, README, and package.json files.
 * The more restrictive the license, the lower the score.
 */
import fs from "fs/promises";
import path from "path";
import { getLogger } from "@package-rater/shared";

const logger = getLogger("cli");

const compatibilityTable = new Map([
  ["LGPL-2.1", 0.75],
  ["MIT", 1],
  ["GPL-3.0", 0.25],
  ["Apache-2.0", 1],
  ["BSD-3-Clause", 1],
  ["BSD-2-Clause", 1],
  ["MPL-2.0", 0.5],
  ["AGPL-3.0", 0.25],
  ["EPL-1.0", 0.5],
  ["EPL-2.0", 0.5],
  ["CC0-1.0", 1],
  ["ISC", 1],
  ["Zlib", 1],
  ["Artistic-2.0", 0.75],
  ["OFL-1.1", 1],
  ["EUPL-1.2", 0.5],
  ["LGPL-3.0", 0.75],
  ["GPL-2.0", 0.25],
  ["GPL-2.0+", 0.25],
  ["GPL-3.0+", 0.25],
  ["AGPL-3.0+", 0.25],
  ["LGPL-2.1+", 0.75],
  ["LGPL-3.0+", 0.75],
  ["Apache-1.1", 0.5],
  ["Apache-1.0", 0.5],
  ["CC-BY-4.0", 1],
  ["CC-BY-SA-4.0", 0.75],
  ["CC-BY-NC-4.0", 0],
  ["CC-BY-ND-4.0", 0],
  ["CC-BY-NC-SA-4.0", 0],
  ["CC-BY-NC-ND-4.0", 0],
  ["0BSD", 1],
  ["Academic Free License v3.0", 1],
  ["AFL-3.0", 1],
  ["Artistic License 2.0", 0.75],
  ["Boost Software License 1.0", 1],
  ["BSL-1.0", 1],
  ["BSD-4-Clause", 0.75],
  ["BSD-3-Clause-Clear", 1],
  ["Creative Commons license family", 1],
  ["CC", 1],
  ["Creative Commons Zero v1.0 Universal", 1],
  ["Creative Commons Attribution 4.0", 1],
  ["Creative Commons Attribution ShareAlike 4.0", 0.75],
  ["Do What The F*ck You Want To Public License", 1],
  ["WTFPL", 1],
  ["Educational Community License v2.0", 0.75],
  ["ECL-2.0", 0.75],
  ["Eclipse Public License 1.0", 0.5],
  ["Eclipse Public License 2.0", 0.5],
  ["European Union Public License 1.1", 0.5],
  ["EUPL-1.1", 0.5],
  ["GNU Affero General Public License v3.0", 0.25],
  ["GNU General Public License v2.0", 0.25],
  ["GNU General Public License v3.0", 0.25],
  ["GNU Lesser General Public License v2.1", 0.75],
  ["GNU Lesser General Public License v3.0", 0.75],
  ["LaTeX Project Public License v1.3c", 0.75],
  ["LPPL-1.3c", 0.75],
  ["Microsoft Public License", 0.5],
  ["MS-PL", 0.5],
  ["Mozilla Public License 2.0", 0.5],
  ["Open Software License 3.0", 0.5],
  ["OSL-3.0", 0.5],
  ["PostgreSQL License", 1],
  ["PostgreSQL", 1],
  ["SIL Open Font License 1.1", 0.75],
  ["University of Illinois/NCSA Open Source License", 1],
  ["NCSA", 1],
  ["The Unlicense", 1],
  ["zLib License", 1]
]);

/**
 * Calculate the license score by checking LICENSE, README, and package.json files.
 * @param owner The owner of the repository.
 * @param repo The name of the repository.
 * @param repoDir The path to the cloned repository directory.
 * @returns The compatibility score based on the license.
 */
export async function calculateLicense(owner: string, repo: string, repoDir?: string): Promise<number> {
  if (!repoDir) {
    logger.error("Repository directory is not defined");
    return 0;
  }
  const files = await fs.readdir(repoDir);
  const packageFilePath = path.join(repoDir, "package.json");
  // Check package.json for license
  try {
    const packageJson = JSON.parse(await fs.readFile(packageFilePath, "utf8"));
    const packageLicense = packageJson.license;
    if (packageLicense && compatibilityTable.has(packageLicense)) {
      logger.info(`Found license ${packageLicense} in package.json for ${owner}/${repo}`);
      return compatibilityTable.get(packageLicense)!;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(`Error reading package.json for ${owner}/${repo}: ${(error as Error).message}`);
    }
  }

  const matchLicenseWithRegex = (content: string): number | null => {
    for (const [license, score] of compatibilityTable) {
      const licenseRegex = new RegExp(`\\b${license}\\b`, "i"); // Word boundary, case-insensitive
      if (licenseRegex.test(content)) {
        return score;
      }
    }
    return null;
  };

  // Check LICENSE file for license
  try {
    const licenseFiles = files.filter((file) => /license/i.test(file));
    for (const licenseFile of licenseFiles) {
      const licenseContent = await fs.readFile(path.join(repoDir, licenseFile), "utf8");
      const score = matchLicenseWithRegex(licenseContent);
      if (score !== null) {
        logger.info(`Found license in LICENSE file for ${owner}/${repo}`);
        return score;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(`Error reading license file for ${owner}/${repo}: ${(error as Error).message}`);
    }
  }

  // Check README.md for license information
  try {
    const readmeFiles = files.filter((file) => /readme/i.test(file));
    for (const readmeFile of readmeFiles) {
      const readmeContent = await fs.readFile(path.join(repoDir, readmeFile), "utf8");
      const score = matchLicenseWithRegex(readmeContent);
      if (score !== null) {
        logger.info(`Found license in README file for ${owner}/${repo}`);
        return score;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error(`Error reading README file for ${owner}/${repo}: ${(error as Error).message}`);
    }
  }

  logger.info(`No valid license found for ${owner}/${repo}`);
  return 0; // Return 0 if no license information was found in License, README, or package.json
}
