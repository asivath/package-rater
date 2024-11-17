import { FastifyRequest, FastifyReply } from "fastify";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import { getLogger } from "@package-rater/shared";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { rm, readdir } from "fs/promises";
import { getMetadata, writeMetadata } from "../util.js";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesDirPath = path.join(__dirname, "..", "..", "packages");

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.AWS_BUCKET_NAME;

export const deletePackage = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!request.params.id) {
    logger.error("Package ID is missing or invalid in request.");
    reply.code(400).send({ error: "There is missing field(s) in the PackageID or invalid" });
    return;
  }

  const id = request.params.id;

  try {
    const metadataJson = getMetadata();

    if (!metadataJson.byId[id]) {
      logger.info(`Package with ID ${id} does not exist.`);
      reply.code(404).send({ error: "Package does not exist" });
      return;
    }

    const { packageName: name, version } = metadataJson.byId[id];

    if (process.env.NODE_ENV === "production") {
      const deleteParams = {
        Bucket: bucketName,
        Delete: { Objects: [{ Key: `${name}/${id}/${name}.tgz` }] }
      };

      const deleteObjectsCommand = new DeleteObjectsCommand(deleteParams);
      await s3Client.send(deleteObjectsCommand);
      logger.info(`Deleted ${name} from S3.`);
    } else {
      const packagePath = path.join(packagesDirPath, name, id);
      await rm(packagePath, { recursive: true, force: true });
      const parentDir = path.join(packagesDirPath, name);
      const filesInParentDir = await readdir(parentDir);

      if (filesInParentDir.length === 0) {
        await rm(parentDir, { recursive: true, force: true });
        logger.info(`Deleted empty package folder: ${parentDir}`);
      }
    }
    delete metadataJson.byId[id];
    delete metadataJson.byName[name][version];
    delete metadataJson.costCache[id];

    if (Object.keys(metadataJson.byName[name]).length === 0) {
      delete metadataJson.byName[name];
    }

    await writeMetadata();

    logger.info(`Successfully deleted package with ID ${id} (${name}@${version}).`);
    reply.code(200).send({ success: "Package is deleted" });
  } catch (error) {
    logger.error(`Failed to delete package with ID ${id}: ${error}`);
    reply.code(500).send({ error: "Error deleting package" });
  }
};
