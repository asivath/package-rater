import { getLogger } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getPackageMetadata } from "../util.js";
import NodeCache from "node-cache";

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
const cache = new NodeCache({ stdTTL: 60 * 60 });

/**
 * Downloads a package from the server
 * @param request
 * @param reply
 * @returns
 */
export const downloadPackage = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const id = request.params.id;

  if (!id) {
    reply
      .code(400)
      .send({ error: "There is missing field(s) in the PackageID or it is formed improperly, or is invalid." });
    return;
  }

  const cacheKey = id;
  const cachedData = cache.get(cacheKey) as CachedPackage | undefined;
  if (cachedData) {
    reply.code(200).send({
      metadata: { Name: cachedData.Name, Version: cachedData.Version, ID: cachedData.ID },
      data: { Content: cachedData.Content }
    });
    return;
  }
  const metadataJson = getPackageMetadata();
  if (!metadataJson.byId[id]) {
    logger.error(`Package with ID ${id} not found`);
    reply.code(404).send({ error: "Package does not exist" });
    return;
  }

  const name: string = metadataJson.byId[id].packageName;
  const version: string = metadataJson.byId[id].version;

  let streamToString = "";
  try {
    if (process.env.NODE_ENV === "production") {
      const params = {
        Bucket: bucketName,
        Key: `${name}/${id}/${name}.tgz`
      };
      const data = await s3Client.send(new GetObjectCommand(params));

      if (!data.Body) {
        logger.error(`Package ${name} with version ${version} not found`);
        reply.code(404).send({ error: "Package does not exist" });
        return;
      }

      streamToString = await data.Body.transformToString("base64");
    } else {
      const packagePath = join(packagesDirPath, name, id, `${name}.tgz`);
      const data = await readFile(packagePath);
      streamToString = data.toString("base64");
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
  } catch (error) {
    logger.error(`Error downloading package ${name} with version ${version}: ${error}`);
    reply.code(500).send({ error: "Internal server error" });
  }
};
