import { FastifyReply, FastifyRequest } from "fastify";
import { getLogger } from "@package-rater/shared";
import {
  calculatePackageId,
  checkIfPackageVersionExists,
  checkIfContentPatchValid,
  getPackageMetadata,
  savePackage
} from "../util.js";
import { writeFile, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { getNpmPackageDetails, getGithubDetails } from "../util.js";
import path from "path";
import unzipper from "unzipper";

const logger = getLogger("server");

/**
 * Uploads a package to the server
 * @param request
 * @param reply
 * @returns
 */
export const uploadVersion = async (
  request: FastifyRequest<{
    Body: {
      metadata: { Name: string; Version: string; ID: string };
      data: { Name: string; Content: string; URL: string; debloat: boolean };
    };
    Params: { id: string };
  }>,
  reply: FastifyReply
) => {
  const { metadata, data } = request.body;
  const oldID = request.params.id; //ID of the package
  const { Content, URL, debloat } = data; //Actual content of the package, URL to download the package, and whether to debloat the package
  const { Name, Version, ID } = metadata; //Name of the package, version of the package, and the new ID of the package

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
    //Checks for versioning and package naming conflicts
    const metadataJson = await getPackageMetadata();

    if (Name !== metadataJson.byId[oldID].packageName || Version !== metadataJson.byId[oldID].version || oldID !== ID) {
      logger.error(`Incorrect packageName or Version given for ${packageName}`);
      reply
        .code(400)
        .send({ error: "There is missing field(s) in the PackageID or it is formed improperly, or is invalid." });
      return;
    }
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

      const availablePackageVersions = metadataJson.byName[Name].versions;
      if (!checkIfContentPatchValid(Object.keys(availablePackageVersions), version)) {
        logger.error(`Package ${packageName} with version ${Version} already exists`);
        reply.code(409).send({ error: "Package already exists" });
        return;
      }
      id = calculatePackageId(packageName, version);
      if (checkIfPackageVersionExists(id)) {
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

      if (metadataJson.byName[packageName].uploadedWithContent === false) {
        logger.error(`Error saving the package ${packageName}: package must be uploaded with URL`);
        reply.code(400).send({ error: "package upload types cannot be mixed" });
      }

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
      if (checkIfPackageVersionExists(id)) {
        logger.error(`Package ${packageName} with version ${version} already exists`);
        reply.code(409).send({ error: "Package already exists" });
        return;
      }

      if (metadataJson.byName[packageName].uploadedWithContent === true) {
        logger.error(`Error saving the package ${packageName}: package must be uploaded via URL`);
        reply.code(400).send({ error: "package upload types cannot be mixed" });
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