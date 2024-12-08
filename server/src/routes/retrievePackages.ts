/**
 * This file contains the functions to retrieve package information from the metadata
 */
import { getLogger, PackageDisplay } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { getPackageMetadata } from "../util.js";
const logger = getLogger("server");

/**
 * Retrieve package information from the metadata
 * @param request
 * @param reply
 * @returns
 */
export const retrievePackageInfo = async (
  request: FastifyRequest<{ Body: Array<{ Name: string; Version?: string }> }>,
  reply: FastifyReply
) => {
  if (!request.body) {
    reply.code(400).send({ error: "Missing array of package objects" });
    return;
  }
  const packageRequests = request.body;
  const limit = 15;

  const offsetHeader = request.headers["offset"] || "0";
  const allFlagHeader = request.headers["allflag"] === "true";
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

  const packages: PackageDisplay[] = [];
  try {
    const metadataJson = getPackageMetadata();
    // Check if "*" is passed as the Name
    if (packageRequests.some((pkg) => pkg.Name === "*")) {
      // Fetch all packages from metadata
      const allPackages = Object.entries(metadataJson.byName);
      allPackages.sort((a, b) => a[0].localeCompare(b[0]));

      for (let offsetCount = offset; offsetCount < offset + limit && offsetCount < allPackages.length; offsetCount++) {
        const [name, versions] = allPackages[offsetCount];
        for (const [version, details] of Object.entries(versions.versions)) {
          if (allFlagHeader) {
            packages.push({
              Version: version,
              Name: name,
              ID: details.id,
              StandaloneCost: details.standaloneCost,
              TotalCost: details.totalCost,
              NetScore: details.ndjson.NetScore,
              CostStatus: details.costStatus,
              UploadedWithContent: versions.uploadedWithContent
            });
          } else {
            packages.push({
              Version: version,
              Name: name,
              ID: details.id
            });
          }
        }
      }

      reply.code(200).send(packages);
      return;
    }

    // Process each package request
    for (const pkg of packageRequests) {
      const Name = pkg.Name;
      let Version = pkg.Version;
      if (!Version) {
        Version = "0.0.0-999999.999999.999999";
      }
      if (!Name || !Version) {
        reply
          .code(400)
          .send({ error: "There is missing field(s) in the PackageQuery or it is formed improperly, or is invalid." });
        return;
      }
      if (!metadataJson.byName[Name]) {
        continue; // Skip to the next package if not found
      }

      const packageByName = metadataJson.byName[Name].versions;
      // Filter by version type and check for duplicates
      for (const [version, details] of Object.entries(packageByName)) {
        if (isVersionMatch(version, Version)) {
          // Check for duplicates before adding
          if (!packages.some((pkg) => pkg.Name === Name && pkg.Version === version)) {
            if (allFlagHeader) {
              packages.push({
                Version: version,
                Name: Name,
                ID: details.id,
                StandaloneCost: details.standaloneCost,
                TotalCost: details.totalCost,
                NetScore: details.ndjson.NetScore,
                UploadedWithContent: metadataJson.byName[Name].uploadedWithContent
              });
            } else {
              packages.push({
                Version: version,
                Name: Name,
                ID: details.id
              });
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error fetching packages:  ${error}`);
    reply.code(500).send({ error: "Server error occurred while fetching packages" });
    return;
  }
  packages.sort((a, b) => a.Name.localeCompare(b.Name));

  const paginatedPackages = packages.slice(offset, offset + limit);
  reply.code(200).send(paginatedPackages);
};

/**
 * Retrieve package information from the metadata by RegEx
 * @param request
 * @param reply
 * @returns
 */
export const retrievePackageByRegEx = async (
  request: FastifyRequest<{ Body: { RegEx: string } }>,
  reply: FastifyReply
) => {
  const { RegEx } = request.body;
  const allFlagHeader = request.headers["allflag"] === "true";
  const offsetHeader = request.headers["offset"] || "0";
  const limit = 15;
  let offset = 0;
  // The extra allFlagHeader is to get all the details of the package for our frontend, its optional
  if (Array.isArray(offsetHeader)) {
    offset = parseInt(offsetHeader[0], 10);
  } else {
    offset = parseInt(offsetHeader || "0", 10);
  }
  if (isNaN(offset) || offset < 0) {
    reply.code(400).send({ error: "Invalid offset value" });
    return;
  }

  // There is missing field(s) in the PackageRegEx or it is formed improperly, or is invalid
  if (!RegEx) {
    reply
      .code(400)
      .send({ error: "There is missing field(s) in the PackageRegEx or it is formed improperly, or is invalid" });
    return;
  }

  const packages: PackageDisplay[] = [];
  try {
    const metadataJson = getPackageMetadata();
    const regex = new RegExp(RegEx, "m");
    // Check if "*" is passed as the RegEx
    for (const [name, versions] of Object.entries(metadataJson.byName)) {
      for (const [version, details] of Object.entries(versions.versions)) {
        if (regex.test(name) || (details.readme && regex.test(details.readme))) {
          if (allFlagHeader) {
            // for frontend
            packages.push({
              Version: version,
              Name: name,
              ID: details.id,
              StandaloneCost: details.standaloneCost,
              TotalCost: details.totalCost,
              NetScore: details.ndjson?.NetScore,
              CostStatus: details.costStatus,
              UploadedWithContent: versions.uploadedWithContent
            });
          } else {
            // what route wants
            packages.push({
              Version: version,
              Name: name,
              ID: details.id
            });
          }
        }
      }
    }
    if (packages.length === 0) {
      reply.code(404).send({ error: "No package found under this regex." });
      return;
    }

    packages.sort((a, b) => a.Name.localeCompare(b.Name));

    const paginatedPackages = packages.slice(offset, offset + limit);
    reply.code(200).send(paginatedPackages);
  } catch (error) {
    logger.error(`Error fetching packages by RegEx: ${error}`);
    reply.code(500).send({ error: "Server error occurred while fetching packages by RegEx" });
  }
};

/**
 * Check if the version matches the requested version
 * @param version
 * @param Version
 * @returns boolean
 */
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

/**
 * Check if the version satisfies the carat (^) operator
 * @param version
 * @param Version
 * @returns boolean
 */
export const satisfiesCarat = (version: string, Version: string): boolean => {
  const [major] = version.split(".");
  const [majorType] = Version.split(".");
  return major === majorType;
};

/**
 * Check if the version satisfies the tilde (~) operator
 * @param version
 * @param Version
 * @returns boolean
 */
export const satisfiesTilde = (version: string, Version: string): boolean => {
  const [major, minor, patch] = version.split(".");
  const [majorType, minorType, patchType] = Version.split(".");
  return major === majorType && minor === minorType && patch >= patchType; //Might be backwards
};

/**
 * Check if the version satisfies the range operator
 * @param version
 * @param minVersion
 * @param maxVersion
 * @returns boolean
 */
export const satisfiesRange = (version: string, minVersion: string, maxVersion: string): boolean => {
  return version >= minVersion && version <= maxVersion;
};
