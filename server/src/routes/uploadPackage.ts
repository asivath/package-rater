import { FastifyReply, FastifyRequest } from "fastify";
import unzipper from "unzipper";
import { getLogger, cloneRepo } from "@package-rater/shared";
import { createHash } from "crypto";
import { checkIfPackageExists, savePackage } from "../util.js";
import { writeFile, readFile, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const logger = getLogger("server");

/**
 * Uploads a package to the server
 * @param request
 * @param reply
 * @returns
 */
export const uploadPackage = async (
  request: FastifyRequest<{ Body: { Content: string; URL: string; debloat: boolean } }>,
  reply: FastifyReply
) => {
  const { Content, URL, debloat } = request.body;
  if ((!Content && !URL) || (Content && URL)) {
    reply.code(400).send({
      error:
        "There is missing field(s) in the PackageData or it is formed improperly (e.g. Content and URL ar both set)"
    });
    return;
  }
  let packageName = "";
  let version = "";
  let id = "";
  try {
    if (Content) {
      const buffer = Buffer.from(Content, "base64");
      const files = await unzipper.Open.buffer(buffer);
      const packageJsonFile = files.files.find((file) => file.path.includes("package.json"));
      if (!packageJsonFile) {
        logger.error(`No package.json found in ${packageName}`);
        reply.code(400).send({ error: "No package.json found in the package" });
        return;
      }
      const packageData = await packageJsonFile.buffer();
      const packageJson = JSON.parse(packageData.toString());
      packageName = packageJson.name;
      version = packageJson.version;
      if (!packageName || !version) {
        logger.error(`Package name or version not found in the package.json of ${packageName}`);
        reply.code(400).send({ error: "Invalid package.json found in the package" });
        return;
      }
      id = createHash("sha256")
        .update(packageName + version)
        .digest("hex");
      if (await checkIfPackageExists(packageName, version)) {
        logger.error(`Package ${packageName} with version ${version} already exists`);
        reply.code(409).send({ error: "Package already exists" });
        return;
      }
      const tempPath = tmpdir();
      for (const file of files.files) {
        const filePath = `${tempPath}/${file.path}`;
        if (file.type === "Directory") {
          await mkdir(filePath, { recursive: true });
        } else {
          const fileBuffer = await file.buffer();
          await writeFile(filePath, fileBuffer);
        }
      }
      const uploadedTempDirPath = path.join(tempPath, files.files[0].path);
      const result = await savePackage(packageName, version, id, uploadedTempDirPath);
      if (result.success === false) {
        logger.error(`Error saving the package ${packageName}: ${result.reason}`);
        reply.code(500).send({ error: "Error saving the package" });
        return;
      }
      await rm(uploadedTempDirPath, { recursive: true });
    } else {
      if (URL.includes("npmjs.com")) {
        const npmPackageMatch = URL.match(/npmjs\.com\/package\/([^/]+)(?:\/v\/([^/]+))?/);
        if (!npmPackageMatch) {
          logger.error(`Invalid npm URL: ${URL}`);
          reply.code(400).send({ error: "Invalid npm URL" });
          return;
        }
        const npmPackageName = npmPackageMatch[1];
        const npmPackageVersion = npmPackageMatch[2];
        if (!npmPackageVersion) {
          const npmPackageDetails = await getNpmPackageDetails(npmPackageName);
          if (!npmPackageDetails) {
            logger.error(`Invalid npm package name: ${npmPackageName}`);
            reply.code(400).send({ error: "Invalid npm package name" });
            return;
          }
          version = npmPackageDetails.version;
        } else {
          version = npmPackageVersion;
        }
        packageName = npmPackageName;
      } else {
        const details = await getGithubDetails(URL);
        if (!details) {
          logger.error(`Invalid Github URL: ${URL}`);
          reply.code(400).send({ error: "Invalid Github URL" });
          return;
        }
        packageName = details.packageName;
        version = details.version;
      }
      id = createHash("sha256")
        .update(packageName + version)
        .digest("hex");
      if (await checkIfPackageExists(packageName, version)) {
        logger.error(`Package ${packageName} with version ${version} already exists`);
        reply.code(409).send({ error: "Package already exists" });
        return;
      }
      const result = await savePackage(packageName, version, id, undefined, URL);
      if (result.success === false) {
        if (result.reason === "Package score is too low") {
          logger.error(`Package ${packageName} is not uploaded due to the disqualified rating.`);
          reply.code(424).send({ error: "Package is not uploaded due to the disqualified rating." });
        } else {
          logger.error(`Error saving the package ${packageName}: ${result.reason}`);
          reply.code(500).send({ error: "Error saving the package" });
        }
        return;
      }
    }
    if (debloat) {
      logger.info("Debloating not implemented yet");
    }
  } catch (error) {
    logger.error(`Error uploading the package ${packageName}:`, error);
    reply.code(500).send({ error: "Error uploading the package" });
    return;
  }
  logger.info(`Package ${packageName} with version ${version} uploaded successfully`);
  reply.code(201).send({ metadata: { Name: packageName, Version: version, ID: id }, data: request.body });
};

/**
 * Gets the details of a package from a github URL
 * @param url The URL of the github repository
 * @returns The package name and version
 */
const getGithubDetails = async (url: string) => {
  let packageName: string | undefined;
  let version: string | undefined;
  const repoDir = await cloneRepo(url, "repo");
  if (repoDir) {
    try {
      const packageJsonFile = await readFile(`${repoDir}/package.json`);
      const packageJson = JSON.parse(packageJsonFile.toString());
      packageName = packageJson.name;
      version = packageJson.version;
    } catch (error) {
      logger.warn("Error reading package.json or it doesn't exist:", error);
    } finally {
      await rm(repoDir, { recursive: true });
    }
  } else {
    logger.error("Error cloning the repository");
  }
  if (!packageName) {
    logger.warn("No package.json or package name found, falling back to GitHub repo name.");
    const githubRegex = /github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)/;
    const match = url.match(githubRegex);
    if (match?.groups) {
      packageName = match.groups.repo;
      try {
        const npmPackageDetails = await getNpmPackageDetails(packageName);
        if (npmPackageDetails) {
          logger.info(
            `Found package in npm registry: ${npmPackageDetails.packageName}, version: ${npmPackageDetails.version}`
          );
          version = version || npmPackageDetails.version;
        } else {
          logger.error("Invalid npm package name or package not found in npm registry.");
        }
      } catch (error) {
        logger.error("Error fetching package details from npm registry:", error);
      }
    } else {
      logger.error("Invalid GitHub URL format.");
    }
  }
  if (!packageName) {
    logger.error("Could not find valid package name.");
    return null;
  }
  if (!version) {
    logger.warn("No version found, falling back to version 1.0.0");
    version = "1.0.0";
  }
  return { packageName, version };
};

/**
 * Get package details from npm registry API
 * @param packageName The npm package name
 * @returns Object containing packageName and version
 */
async function getNpmPackageDetails(packageName: string): Promise<{ packageName: string; version: string } | null> {
  try {
    const npmUrl = `https://registry.npmjs.org/${packageName}`;
    const response = await fetch(npmUrl);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      packageName: data.name,
      version: data["dist-tags"].latest
    };
  } catch (error) {
    logger.error(`Error fetching npm package details for ${packageName}:`, error);
    return null;
  }
}
