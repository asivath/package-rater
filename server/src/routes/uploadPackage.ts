import { FastifyReply, FastifyRequest } from "fastify";
import unzipper from "unzipper";
import { getLogger } from "@package-rater/shared";
import { hash } from "crypto";
import { savePackage } from "./util.js";

/**
 * Uploads a package to the server
 * @param request
 * @param reply
 * @returns
 */
export const uploadPackage = async (
  request: FastifyRequest<{ Body: { Content: string; URL: string; debloat: boolean } }>,
  reply: FastifyReply
) => {
  const { Content, URL, debloat } = request.body;
  const logger = getLogger("server");
  if ((!Content && !URL) || (Content && URL)) {
    reply.code(400).send({
      error:
        "There is missing field(s) in the PackageData or it is formed improperly (e.g. Content and URL ar both set)"
    });
    return;
  }
  if (Content) {
    const buffer = Buffer.from(Content, "base64");
    try {
      const files = await unzipper.Open.buffer(buffer);
      const packageJson = files.files.find((file) => file.path === "package.json");
      if (!packageJson) {
        logger.error("No package.json found in the package uploaded");
        reply.code(400).send({ error: "No package.json found in the package" });
        return;
      }
      const packageData = await packageJson.buffer();
      const { name: packageName, version: version } = JSON.parse(packageData.toString());
      if (!packageName || !version) {
        logger.error("Invalid package.json found in the package uploaded");
        reply.code(400).send({ error: "Invalid package.json found in the package" });
        return;
      }
      const id = hash("sha256", packageName + version).digest("hex");
      await savePackage(packageName, version, id, buffer, 0, "private");
    } catch (error) {
      logger.error(`Error uploading package: ${error}`);
    }
  } else {
  }
  reply.code(200).send({ message: "Package uploaded successfully" });
};
