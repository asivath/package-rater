import { FastifyRequest, FastifyReply } from "fastify";
import { getLogger } from "@package-rater/shared";
import { getPackageMetadata } from "../util.js";

const logger = getLogger("server");

export const retrieveContentOrURL = async (
  request: FastifyRequest<{ Params: { name: string } }>,
  reply: FastifyReply
) => {
  if (!request.params.name) {
    logger.error("Package ID is missing or invalid in request.");
    reply.code(400).send({ error: "There is missing field(s) in the PackageID or invalid" });
    return;
  }

  const name = request.params.name;

  try {
    const metadataJson = getPackageMetadata();
    reply.code(200).send({ uploadedWithContent: metadataJson.byName[name].uploadedWithContent });

    logger.info(`Successfully grabbed upload type for(${name}`);
    reply.code(200).send({ success: "Package is deleted" });
  } catch (error) {
    logger.error(`Failed to grab upload type for ${name}: ${error}`);
    reply.code(500).send({ error: "Error grabbing upload type for package" });
  }
};
