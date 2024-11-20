import { FastifyReply, FastifyRequest } from "fastify";
import { getLogger, cloneRepo } from "@package-rater/shared";
import { calculatePackageId, checkIfPackageExists, savePackage } from "../util.js";
import { writeFile, readFile, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import unzipper from "unzipper";

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
      const packageJsonFile = files.files.find((file) => {
        const parths = file.path.split("/");
        return parths[parths.length - 1] === "package.json";
      });
      if (!packageJsonFile) {
        logger.error(`No package.json found in ${packageName}`);
        reply.code(400).send({ error: "No package.json found in the package" });
        return;
      }
      const packageData = await packageJsonFile.buffer();
      const packageJson = JSON.parse(packageData.toString());
      packageName = packageJson.name || files.files[0].path.split("/")[0];
      version = packageJson.version || "1.0.0";
      id = calculatePackageId(packageName, version);
      if (checkIfPackageExists(id)) {
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
      const result = await savePackage(packageName, version, id, debloat, uploadedTempDirPath);
      if (result.success === false) {
        logger.error(`Error saving the package ${packageName}: ${result.reason}`);
        reply.code(500).send({ error: "Error saving the package" });
        return;
      }
      await rm(uploadedTempDirPath, { recursive: true });
    } else {
      const normalizedURL = URL.replace("www.npmjs.org", "www.npmjs.com");
      if (normalizedURL.includes("npmjs.com")) {
        const pathParts = normalizedURL.split("/");
        const packageIndex = pathParts.indexOf("package");
        if (packageIndex === -1) {
          logger.error(`Invalid npm URL: ${normalizedURL}`);
          reply.code(400).send({ error: "Invalid npm URL" });
          return;
        }
        let npmPackageName = decodeURIComponent(pathParts[packageIndex + 1]);
        if (npmPackageName.startsWith("@")) {
          npmPackageName += `/${decodeURIComponent(pathParts[packageIndex + 2])}`;
        }
        const npmPackageVersion = pathParts.includes("v") ? pathParts[pathParts.indexOf("v") + 1] : null;
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
        const details = await getGithubDetails(normalizedURL);
        if (!details) {
          logger.error(`Invalid Github URL: ${normalizedURL}`);
          reply.code(400).send({ error: "Invalid Github URL" });
          return;
        }
        packageName = details.packageName;
        version = details.version;
      }
      id = calculatePackageId(packageName, version);
      if (checkIfPackageExists(id)) {
        logger.error(`Package ${packageName} with version ${version} already exists`);
        reply.code(409).send({ error: "Package already exists" });
        return;
      }
      const result = await savePackage(packageName, version, id, debloat, undefined, normalizedURL);
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
        logger.error(`Error fetching package details from npm registry: ${(error as Error).message}`);
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
async function getNpmPackageDetails(
  packageName: string
): Promise<{ packageName: string; version: string; dependencies: { [dependency: string]: string } } | null> {
  try {
    const npmUrl = `https://registry.npmjs.org/${packageName}`;
    const response = await fetch(npmUrl);
    if (!response.ok) return null;
    const data = await response.json();
    const dependencies = data.versions[data["dist-tags"].latest].dependencies || {};
    return {
      packageName: data.name,
      version: data["dist-tags"].latest,
      dependencies: dependencies
    };
  } catch (error) {
    logger.error(`Error fetching npm package details for ${packageName}: ${(error as Error).message}`);
    return null;
  }
}
