/**
 * Get the total cost of a package via dependecies
 * We don't get dev dep and peer dep costs
 */
import { FastifyRequest, FastifyReply } from "fastify";
import { getPackageMetadata, calculateTotalPackageCost, calculatePackageId } from "../util.js";
import { assertIsPackageCostResponse, getLogger, PackageCostResponse } from "@package-rater/shared";

const logger = getLogger("server");

/**
 * Get the total cost of a package via dependecies
 * @param request
 * @param reply
 * @returns The total cost of the package
 */
export const getPackageCost = async (
  request: FastifyRequest<{
    Params: { id: string };
    Querystring: { dependency?: boolean };
  }>,
  reply: FastifyReply
) => {
  const { id } = request.params;
  const { dependency = false } = request.query;

  if (!id) {
    reply.code(400).send({ error: "There is missing field(s) in the PackageID" });
  }
  // Get the package metadata
  const metadata = getPackageMetadata();
  const packageMetadata = metadata.byId[id];
  if (!packageMetadata) {
    reply.code(404).send({ error: "Package not found" });
    return;
  }

  // If the cost status is not completed, calculate the total cost
  try {
    if (packageMetadata.costStatus !== "completed") {
      try {
        await calculateTotalPackageCost(packageMetadata.packageName, packageMetadata.version);
      } catch (error) {
        logger.error(`Failed to calculate cost: ${(error as Error).message}`);
        reply.code(500).send({ error: "Failed to calculate cost" });
        return;
      }
    }

    const result: PackageCostResponse = {};
    const visited = new Set<string>();

    if (!dependency) {
      reply.send({ [id]: { totalCost: packageMetadata.totalCost } });
      return;
    }

    /**
     * Collect the costs of the package and its dependencies
     * @param currentId
     * @returns The total cost of the package and its dependencies
     */
    async function collectCosts(currentId: string) {
      if (visited.has(currentId)) {
        return;
      }
      visited.add(currentId);

      const costCache = metadata.byId[currentId] || metadata.costCache[currentId];
      if (!costCache) {
        return;
      }

      result[currentId] = {
        standaloneCost: costCache.standaloneCost,
        totalCost: costCache.totalCost
      };

      // Collect the costs of the dependencies
      const dependencies = costCache.dependencies;
      for (const depName in dependencies) {
        const depVersion = dependencies[depName];
        const depId = calculatePackageId(depName, depVersion);
        await collectCosts(depId);
      }
    }

    await collectCosts(id);
    assertIsPackageCostResponse(result);
    reply.send(result);
  } catch (error) {
    logger.error(`Failed to calculate cost: ${(error as Error).message}`);
    reply.code(500).send({ error: "Failed to calculate cost" });
  }
};
