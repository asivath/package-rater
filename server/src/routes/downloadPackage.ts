import { getLogger } from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { readFile } from "fs/promises";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesDirPath = path.join(__dirname, "..", "..", "packages");
const metadataPath = path.join(packagesDirPath, "metadata.json");

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.AWS_BUCKET_NAME;

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

  const metaDataContent = await readFile(metadataPath, "utf-8");
  const metadataJson = JSON.parse(metaDataContent);
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

      // Convert stream to string
      streamToString = await data.Body.transformToString("base64");
    } else {
      const packagePath = path.join(packagesDirPath, name, id, `${name}.tgz`);
      console.log("packagePath", packagePath);
      const data = await readFile(packagePath);
      streamToString = data.toString("base64");
    }

    console.log();

    /**
    const pipelineAsync = promisify(pipeline);
    Uncomment this block to save the package to the server
    const readableStream = Readable.from(Buffer.from(streamToString, "base64"));
    const outputPath = path.join(packagesDirPath, ${name}-${version}.tgz);
    const writableStream = createWriteStream(outputPath);
    await pipelineAsync(readableStream, writableStream);
    **/

    // Send response metadata
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
