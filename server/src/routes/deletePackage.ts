import { FastifyRequest, FastifyReply } from "fastify";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { getLogger } from "@package-rater/shared";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesDirPath = path.join(__dirname, "..", "..", "packages");
const metadataPath = path.join(packagesDirPath, "metadata.json");

export const deletePackage = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!request.params.id) {
    logger.error("Package ID is missing or invalid in request.");
    reply.code(400).send({ error: "There is missing field(s) in the PackageID or invalid" });
    return;
  }
  const id = request.params.id;

  try {
    const metaDataContent = await readFile(metadataPath, "utf-8");
    const metadataJson = JSON.parse(metaDataContent);

    if (!metadataJson.byId[id]) {
      logger.info(`Package with ID ${id} does not exist.`);
      reply.code(404).send({ error: "Package does not exist" });
      return;
    }

    const { packageName: name, version } = metadataJson.byId[id];
    delete metadataJson.byId[id];
    delete metadataJson.byName[name][version];

    await writeFile(metadataPath, JSON.stringify(metadataJson, null, 2));
    logger.info(`Successfully deleted package with ID ${id} (${name}@${version}).`);
    reply.code(200).send({ success: "Package is deleted" });
  } catch (error) {
    logger.error(`Failed to delete package with ID ${id}: ${error}`);
    reply.code(500).send({ error: "Error deleting package" });
  }
};
