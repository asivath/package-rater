import { getLogger } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFile, readdir, rm } from "fs/promises";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesDirPath = join(__dirname, "..", "..", "packages");
const metadataPath = join(packagesDirPath, "metadata.json");

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.AWS_BUCKET_NAME;

export const resetPackages = async (_: FastifyRequest, reply: FastifyReply) => {
  try {
    if (process.env.NODE_ENV === "prod") {
      let isTruncated = true;
      while (isTruncated) {
        const listObjectsCommand = new ListObjectsV2Command({ Bucket: bucketName });
        const objectsList = await s3Client.send(listObjectsCommand);

        if (objectsList.Contents && objectsList.Contents.length > 0) {
          const deleteParams = {
            Bucket: bucketName,
            Delete: { Objects: objectsList.Contents.map((obj) => ({ Key: obj.Key })) }
          };
          const deleteObjectsCommand = new DeleteObjectsCommand(deleteParams);
          await s3Client.send(deleteObjectsCommand);
        }

        isTruncated = objectsList.IsTruncated ?? false;
      }
      logger.info("S3 bucket cleared successfully");
    }

    const files = await readdir(packagesDirPath);
    for (const file of files) {
      await rm(join(packagesDirPath, file), { recursive: true, force: true });
    }
    await writeFile(metadataPath, JSON.stringify({ byId: {}, byName: {} }, null, 2));
    logger.info("Local packages cleared successfully");

    reply.code(200).send({ message: "Packages reset successfully" });
  } catch (error) {
    logger.error("Failed to reset packages", error);
    reply.code(500).send({ message: "Failed to reset packages" });
  }
};
