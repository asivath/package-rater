/** This file contains the route for uploading a package to the server
 * It saves the package to the server and S3 bucket
 */
import { FastifyReply, FastifyRequest } from "fastify";
import { getLogger } from "@package-rater/shared";
import {
  calculatePackageId,
  checkIfPackageExists,
  savePackage,
  getNpmPackageDetails,
  getGithubDetails
} from "../util.js";
import AdmZip from "adm-zip";

const logger = getLogger("server");

/**
 * Uploads a new package to the server
 * @param request
 * @param reply
 * @returns A message indicating the package was uploaded successfully
 */
export const uploadPackage = async (
  request: FastifyRequest<{ Body: { Content: string; URL: string; debloat: boolean } }>,
  reply: FastifyReply
) => {
  if (!request.body || (!request.body.Content && !request.body.URL)) {
    reply.code(400).send({ error: "There is missing field(s) in the PackageData or it is formed improperly" });
    return;
  }
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
      // If the Content is provided, we extract the package name and version from the package.json
      const buffer = Buffer.from(Content, "base64");
      const zip = new AdmZip(buffer);
      const packageJsonEntry = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory && entry.entryName.endsWith("package.json"))
        .sort((a, b) => a.entryName.split("/").length - b.entryName.split("/").length)[0];
      if (!packageJsonEntry) {
        logger.error("No package.json found in the uploaded package");
        reply.code(400).send({ error: "No package.json found in the package" });
        return;
      }
      // By default, we take the first package.json found in the zip
      const packageJson = JSON.parse(packageJsonEntry.getData().toString());
      packageName = packageJson.name;
      version = packageJson.version || "1.0.0";
      id = calculatePackageId(packageName, version);
      if (checkIfPackageExists(id)) {
        logger.error(`Package ${packageName} with version ${version} already exists, use the update route`);
        reply.code(409).send({ error: "Package already exists" });
        return;
      }
      // Save the package to the server and S3 bucket
      const result = await savePackage(packageName, version, id, debloat, zip);
      if (result.success === false) {
        logger.error(`Error saving the package ${packageName}: ${result.reason}`);
        reply.code(500).send({ error: "Error saving the package" });
        return;
      }
    } else {
      // If the URL is provided, we need to download the package and save it
      const normalizedURL = URL.replace("www.npmjs.org", "www.npmjs.com");
      if (normalizedURL.includes("npmjs.com")) {
        const pathParts = normalizedURL.split("/");
        const packageIndex = pathParts.indexOf("package");
        if (packageIndex === -1) {
          logger.error(`Invalid npm URL: ${normalizedURL}`);
          reply.code(400).send({ error: "Invalid npm URL" });
          return;
        }
        // Extract the package name and version from the URL
        let npmPackageName = decodeURIComponent(pathParts[packageIndex + 1]);
        if (npmPackageName.startsWith("@")) {
          npmPackageName += `/${decodeURIComponent(pathParts[packageIndex + 2])}`;
        }
        const npmPackageVersion = pathParts.includes("v") ? pathParts[pathParts.indexOf("v") + 1] : null;
        // If the version is not provided, we get the latest version from the npm registry
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
        // If the URL is a Github URL, we extract the package name and version from the URL
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
      // Check if the package already exists
      if (checkIfPackageExists(id)) {
        logger.error(`Package ${packageName} with version ${version} already exists, use the update route`);
        reply.code(409).send({ error: "Package already exists" });
        return;
      }
      const result = await savePackage(packageName, version, id, debloat, undefined, normalizedURL);
      // Save the package to the server and S3 bucket
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
  const data = Content ? { Content } : { URL };
  reply.code(201).send({ metadata: { Name: packageName, Version: version, ID: id }, data });
};
