/**
 * This file contains the route for downloading a package from the server
 * It fetches the package from the server via ID
 * */
import { getLogger } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getPackageMetadata } from "../util.js";
import { cache } from "../index.js";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesDirPath = join(__dirname, "..", "..", "packages");

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.AWS_BUCKET_NAME;

type CachedPackage = {
  Name: string;
  Version: string;
  ID: string;
  Content: string;
};

/**
 * Gets package base-64 content from the server
 * @param request
 * @param reply
 * @returns base-64 content of the package
 */
export const downloadPackage = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const id = request.params.id;
  if (!id) {
    reply
      .code(400)
      .send({ error: "There is missing field(s) in the PackageID or it is formed improperly, or is invalid." });
    return;
  }

  // Check if the package exists in cache
  const cacheKey = id;
  const cachedData = cache.get(cacheKey) as CachedPackage | undefined;
  if (cachedData) {
    reply.code(200).send({
      metadata: { Name: cachedData.Name, Version: cachedData.Version, ID: cachedData.ID },
      data: { Content: cachedData.Content }
    });
    return;
  }

  // Get the package metadata and checks for existance
  const metadataJson = getPackageMetadata();
  if (!metadataJson.byId[id]) {
    logger.error(`Package with ID ${id} not found`);
    reply.code(404).send({ error: "Package does not exist" });
    return;
  }

  // Get the package name and version
  const name: string = metadataJson.byId[id].packageName;
  const version: string = metadataJson.byId[id].version;
  const escapedPackageName = name.replace("/", "_");

  let streamToString = "";
  try {
    // If the server is in production, fetch the package from S3
    if (process.env.NODE_ENV === "production") {
      const params = {
        Bucket: bucketName,
        Key: `${escapedPackageName}/${id}/${escapedPackageName}.zip`
      };
      const data = await s3Client.send(new GetObjectCommand(params));

      if (!data.Body) {
        logger.error(`Package ${name} with version ${version} not found`);
        reply.code(404).send({ error: "Package does not exist" });
        return;
      }
      const zipData = await data.Body.transformToByteArray();
      streamToString = Buffer.from(zipData).toString("base64");
    } else {
      // If the server is in development, fetch the package from the local file system
      const zipPath = join(packagesDirPath, escapedPackageName, id, `${escapedPackageName}.zip`);
      const zipData = await readFile(zipPath);
      streamToString = zipData.toString("base64");
    }
    cache.set(cacheKey, { Name: name, Version: version, ID: id, Content: streamToString });
    reply.code(200).send({
      metadata: {
        Name: name,
        Version: version,
        ID: id
      },
      data: {
        Content: streamToString
      }
    });
    return;
  } catch (error) {
    logger.error(`Error downloading package ${name} with version ${version}: ${error}`);
    reply.code(500).send({ error: "Internal server error" });
    return;
  }
};
