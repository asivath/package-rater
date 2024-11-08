import { getLogger, PackageDisplay } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { getPackageMetadata } from "../util.js";
const logger = getLogger("server");

export const retrievePackageInfo = async (
  request: FastifyRequest<{ Body: Array<{ Name: string; Version: string }> }>,
  reply: FastifyReply
) => {
  const packageRequests = request.body;
  const limit = 15;

  const offsetHeader = request.headers["offset"] || "0";
  const allFlagHeader = request.headers["allflag"] || false;
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

      for (let offsetCount = offset; offsetCount < offset + limit && offsetCount < allPackages.length; offsetCount++) {
        const [name, versions] = allPackages[offsetCount];
        for (const [version, details] of Object.entries(versions)) {
          if (allFlagHeader) {
            packages.push({
              Version: version,
              Name: name,
              ID: details.id,
              StandaloneCost: details.standaloneCost,
              TotalCost: details.totalCost,
              NetScore: details.ndjson?.NetScore || "N/A",
              CostStatus: details.costStatus
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

      logger.info(`Fetched packages: ${JSON.stringify(packages)}`);
      reply.code(200).send(packages);
      return;
    }
    // Process each package request
    for (const { Name, Version } of packageRequests) {
      if (!Name || !Version) {
        reply.code(400).send({ error: "Missing Name or Version in one of the package objects" });
        return;
      }

      const packageByName = metadataJson.byName[Name];
      if (!packageByName) {
        continue; // Skip to the next package if not found
      }

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
                NetScore: details.ndjson?.NetScore || "N/A"
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

// [{
//   Version: '17.0.1',
//   Name: 'browserify',
//   ID: '5209905695993030',
//   StandaloneCost: 0.9316482543945312,
//   TotalCost: 0,
//   NetScore: 0.6
// },
// {
//   Version: '16.3.0',
//   Name: 'browserify',
//   ID: '1039622501670058',
//   StandaloneCost: 1.1853208541870117,
//   TotalCost: 0,
//   NetScore: 0.8
// }]
