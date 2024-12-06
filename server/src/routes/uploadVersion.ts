import { FastifyReply, FastifyRequest } from "fastify";
import { getLogger } from "@package-rater/shared";
import {
  calculatePackageId,
  checkIfContentPatchValid,
  getPackageMetadata,
  savePackage,
  checkIfPackageExists
} from "../util.js";
import AdmZip from "adm-zip";

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
      data: { Name: string; Content?: string; URL?: string; debloat?: boolean };
    };
    Params: { id: string };
  }>,
  reply: FastifyReply
) => {
  if (!request.body?.metadata || !request.body?.data) {
    return reply.code(400).send({
      error:
        "There is missing field(s) in the PackageData or it is formed improperly (e.g. Content and URL ar both set)"
    });
  }

  const { metadata, data } = request.body;
  const oldID = request.params.id;
  const { Content, URL, debloat = false } = data;
  const { Name, Version, ID } = metadata;
  if ((!Content && !URL) || (Content && URL)) {
    return reply.code(400).send({
      error:
        "There is missing field(s) in the PackageData or it is formed improperly (e.g. Content and URL ar both set)"
    });
  }

  if (!checkIfPackageExists(oldID)) {
    return reply.code(404).send({ error: "Package not found" });
  }
  const id = calculatePackageId(Name, Version);
  if (checkIfPackageExists(id)) {
    return reply.code(409).send({ error: "Package already exists" });
  }

  try {
    const metadataJson = getPackageMetadata();

    if (Name !== metadataJson.byId[oldID].packageName || oldID !== ID) {
      logger.error(`Incorrect package ID or name provided for package ${Name}`);
      return reply
        .code(400)
        .send({ error: "There is missing field(s) in the PackageID or it is formed improperly, or is invalid" });
    }

    const availablePackageVersions = metadataJson.byName[Name].versions;
    if (!checkIfContentPatchValid(Object.keys(availablePackageVersions), Version)) {
      logger.error(`Incorrect package version provided for package ${Name}`);
      return reply
        .code(400)
        .send({ error: "Cannot provide a version with patch number lower than available versions already uploaded" });
    }

    let result;
    if (Content) {
      const buffer = Buffer.from(Content, "base64");
      const zip = new AdmZip(buffer);
      const packageJsonEntry = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory && entry.entryName.endsWith("package.json"))
        .sort((a, b) => a.entryName.split("/").length - b.entryName.split("/").length)[0];

      if (!packageJsonEntry) {
        logger.error("No package.json found in the uploaded package");
        return reply.code(400).send({ error: "No package.json found in the package" });
      }

      const packageJson = JSON.parse(packageJsonEntry.getData().toString());
      if (!packageJson.name || !packageJson.version || packageJson.name !== Name || packageJson.version !== Version) {
        logger.error("Package.json name/version mismatch");
        return reply.code(400).send({
          error: "Package.json is missing name or version or does not match the provided package name/version"
        });
      }

      if (metadataJson.byName[Name].uploadedWithContent === false) {
        logger.error(`Error saving the package ${Name}: package must be uploaded with URL`);
        return reply.code(400).send({ error: "Package upload types cannot be mixed" });
      }
      result = await savePackage(Name, Version, id, debloat, zip);
    } else {
      const normalizedURL = URL!.replace("www.npmjs.org", "www.npmjs.com");

      if (metadataJson.byName[Name].uploadedWithContent === true) {
        logger.error(`Error saving the package ${Name}: package must be uploaded via URL.`);
        return reply.code(400).send({ error: "Package upload types cannot be mixed" });
      }

      result = await savePackage(Name, Version, id, debloat, undefined, normalizedURL);
    }

    if (result.success === false) {
      if (result.reason === "Package score is too low") {
        logger.error(`Package ${Name} is not uploaded due to the disqualified rating.`);
        return reply.code(424).send({ error: "Package is not uploaded due to the disqualified rating." });
      } else {
        logger.error(`Error saving the package ${Name}: ${result.reason}`);
        return reply.code(500).send({ error: "Error saving the package" });
      }
    }
  } catch (error) {
    logger.error(`Error uploading the package ${Name}:`, error);
    return reply.code(500).send({ error: "Error uploading the package" });
  }

  logger.info(`Package ${Name} with version ${Version} uploaded successfully`);
  return reply.code(200).send({ message: "Version is updated." });
};
