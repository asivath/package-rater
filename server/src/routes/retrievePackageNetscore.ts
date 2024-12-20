/**
 * retrieves the Netscore of a package
 */
import { getLogger } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { getPackageMetadata } from "../util.js";
const logger = getLogger("server");

/**
 * Retrieve Netscore of a package from the metadata
 * @param request
 * @param reply
 * @returns A message if the package was uploaded successfully
 */
export const retrievePackageNetscore = async (
  request: FastifyRequest<{
    Params: { id: string };
  }>,
  reply: FastifyReply
) => {
  const { id } = request.params;

  // Check if the package ID is valid
  if (!id) {
    reply.code(400).send({ error: "There is missing field(s) in the PackageID" });
    return;
  }
  const metadataJson = getPackageMetadata();

  // Check if the package exists
  if (!metadataJson.byId[id]) {
    logger.error(`Package with ID ${id} not found`);
    reply.code(404).send({ error: "Package does not exist" });
    return;
  }
  // Check if the package has a Netscore
  if (!metadataJson.byId[id].ndjson) {
    logger.error(`Package with ID ${id} does not have a Netscore`);
    reply.code(404).send({ error: "The package rating system choked on at least one of the metrics" });
    return;
  }

  // Retrieve the Netscore of the package
  const packageRating = metadataJson.byId[id].ndjson;

  reply.code(200).send(packageRating);
};
