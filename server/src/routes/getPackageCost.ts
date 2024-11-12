import { FastifyRequest, FastifyReply } from "fastify";
import { getMetadata, calculateTotalPackageCost, calculatePackageId } from "../util.js";
import { assertIsPackageCostResponse, getLogger, PackageCostResponse } from "@package-rater/shared";

const logger = getLogger("server");

/**
 * Get the total cost of a package
 * @param request
 * @param reply
 * @returns
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

  const metadata = getMetadata();
  const packageMetadata = metadata.byId[id];
  if (!packageMetadata) {
    reply.code(404).send({ error: "Package not found" });
    return;
  }

  try {
    if (packageMetadata.costStatus !== "completed") {
      try {
        await calculateTotalPackageCost(id);
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
