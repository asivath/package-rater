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
      if (await checkIfPackageExists(id)) {
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
      if (await checkIfPackageExists(id)) {
        logger.error(`Package ${packageName} with version ${version} already exists`);
        reply.code(409).send({ error: "Package already exists" });
        return;
      }
      const result = await savePackage(packageName, version, id, undefined, URL);
      if (result.success === false) {
        if (result.reason === "Package score is too low") {
          logger.error(`Package ${packageName} is not uploaded due to the disqualified rating.`);
          reply.code(421).send({ error: "Package is not uploaded due to the disqualified rating." });
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
  reply.code(201).send({ metadata: { Name: package } });
};
