import { FastifyReply, FastifyRequest } from "fastify";
import unzipper from "unzipper";
import { getLogger } from "@package-rater/shared";

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
      const topLevelDirs = new Set<string>();
      files.files.forEach((file) => {
        const topLevelDir = file.path.split("/")[0];
        if (topLevelDir) {
          topLevelDirs.add(topLevelDir);
        }
      });
      const packageName = Array.from(topLevelDirs)[0];
      if (!packageName) {
        logger.error("No top-level directory found in package");
        reply.code(400).send({ error: "No top-level directory found in package" });
      }
      logger.info(`Package ${packageName} uploaded`);
      console.log(`Package ${packageName} uploaded`);
    } catch (error) {
      logger.error(`Error uploading package: ${error}`);
    }
  }
  if (debloat) {
    console.log("Debloating package...");
  }
  reply.code(200).send({ message: "Package uploaded successfully" });
};
