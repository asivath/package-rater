/**
 * Reset packages route
 * This file contains the route for resetting the packages on the server
 * It clears the packages from the server and S3 bucket
 * */
import { getLogger } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readdir, rm } from "fs/promises";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { clearMetadata } from "../util.js";
import { cache } from "../index.js";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesDirPath = join(__dirname, "..", "..", "packages");

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.AWS_BUCKET_NAME;

/**
 * Reset packages
 * @param _
 * @param reply
 * @returns A message indicating the packages were reset successfully
 * */
export const resetPackages = async (_: FastifyRequest, reply: FastifyReply) => {
  try {
    // Clear the cache
    cache.flushAll();

    // Clear the S3 bucket
    if (process.env.NODE_ENV === "production") {
      let isTruncated = true;
      while (isTruncated) {
        const listObjectsCommand = new ListObjectsV2Command({ Bucket: bucketName });
        const objectsList = await s3Client.send(listObjectsCommand);

        // Delete all objects in the bucket
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

    // Clear the local packages
    const files = await readdir(packagesDirPath);
    for (const file of files) {
      await rm(join(packagesDirPath, file), { recursive: true, force: true });
    }
    await clearMetadata();
    logger.info("Local packages cleared successfully");

    reply.code(200).send({ message: "Packages reset successfully" });
  } catch (error) {
    logger.error("Failed to reset packages", error);
    reply.code(500).send({ message: "Failed to reset packages" });
  }
};
