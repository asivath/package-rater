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

export const getVersions = async (request: FastifyRequest<{ Body: { packageName: string } }>, reply: FastifyReply) => {
  const { packageName } = request.body;
  if (!packageName) {
    reply.code(400).send({
      error: "No package name provided"
    });
    return;
  }

  let versions: string[] = [];
  try {
    if (packageName) {
      const metaDataContent = await readFile(metadataPath, "utf-8");

      if (!metaDataContent) {
        reply.code(404).send({
          error: "Package not found"
        });
        return;
      }
      const metaData = JSON.parse(metaDataContent);
      versions = Object.keys(metaData[packageName].versions);
    }
  } catch (error) {
    logger.error(`Error fetching package versions for ${packageName}: `, error);
  }
  logger.info(`Fetched versions for ${packageName}:  ${versions}`);
  reply.code(201).send(versions);
};
