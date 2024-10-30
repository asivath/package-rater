import { getLogger } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { readFile } from "fs/promises";
import path from "path";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesDirPath = path.join(__dirname, "..", "..", "packages");
const metadataPath = path.join(packagesDirPath, "metadata.json");

export const postPackages = async (
  request: FastifyRequest<{ Body: Array<{ Name: string; Version: string }> }>,
  reply: FastifyReply
) => {
  const packageRequests = request.body;
  const limit = 15;

  const offsetHeader = request.headers["offset"] || "0";
  let offset = 0;

  //Have to check if offset is an array or typescript has a meltdown (:D)
  if (Array.isArray(offsetHeader)) {
    offset = parseInt(offsetHeader[0], 10);
  } else {
    offset = parseInt(offsetHeader || "0", 10);
  }

  if (isNaN(offset) || offset < 0) {
    reply.code(400).send({ error: "Invalid offset value" });
    return;
  }

  if (!Array.isArray(packageRequests) || packageRequests.length === 0) {
    reply.code(400).send({ error: "Missing or invalid array of package objects" });
    return;
  }

  const packages: Array<{ Version: string; Name: string; ID: string }> = [];
  try {
    const metaDataContent = await readFile(metadataPath, "utf-8");

    const metadataJson = JSON.parse(metaDataContent);

    // Check if "*" is passed as the Name
    const allPackagesRequested = packageRequests.some((pkg) => pkg.Name === "*");
    if (allPackagesRequested) {
      // Fetch all packages from metadata
      for (const [name, versions] of Object.entries(metadataJson.byName)) {
        for (const [version, details] of Object.entries(versions as { [key: string]: { id: string } })) {
          packages.push({
            Version: version,
            Name: name,
            ID: details.id
          });
        }
      }
      // No need to continue processing further since we got all packages
      // Apply pagination
      const paginatedPackages = packages.slice(offset, offset + limit); // Skip `offset` number of packages
      logger.info(`Fetched packages: ${JSON.stringify(paginatedPackages)}`);
      reply.code(200).send(paginatedPackages);
      return;
    }

    // Process each package request
    for (const { Name, Version } of packageRequests) {
      if (!Name || !Version) {
        reply.code(400).send({error: "Missing Name or Version in one of the package objects"});
        return;
      }

      const packageByName = metadataJson.byName[Name];
      if (!packageByName) {
        continue; // Skip to the next package if not found
      }

      // Filter by version type and check for duplicates
      for (const [version, details] of Object.entries(packageByName) as [string, { id: string }][]) {
        if (isVersionMatch(version, Version)) {
          // Check for duplicates before adding
          if (!packages.some((pkg) => pkg.Name === Name && pkg.Version === version)) {
            packages.push({
              Version: version,
              Name: Name,
              ID: details.id
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error fetching packages: `, error);
    reply.code(500).send({ error: "Server error occurred while fetching packages" });
    return;
  }
  const paginatedPackages = packages.slice(offset, offset + limit);

  logger.info(`Fetched packages: ${JSON.stringify(paginatedPackages)}`);
  reply.code(200).send(paginatedPackages);
};

export const isVersionMatch = (version: string, Version: string): boolean => {
  if (Version === version) return true; // Exact match

  if (Version.startsWith("^")) {
    return satisfiesCarat(version, Version.slice(1));
  } else if (Version.startsWith("~")) {
    return satisfiesTilde(version, Version.slice(1));
  } else if (Version.includes("-")) {
    const [minVersion, maxVersion] = Version.split("-");
    return satisfiesRange(version, minVersion, maxVersion);
  }

  return false;
};

export const satisfiesCarat = (version: string, Version: string): boolean => {
  const [major] = version.split(".");
  const [majorType] = Version.split(".");
  return major === majorType;
};

export const satisfiesTilde = (version: string, Version: string): boolean => {
  const [major, minor] = version.split(".");
  const [majorType, minorType] = Version.split(".");
  return major === majorType && minor === minorType;
};

export const satisfiesRange = (version: string, minVersion: string, maxVersion: string): boolean => {
  return version >= minVersion && version <= maxVersion;
};
