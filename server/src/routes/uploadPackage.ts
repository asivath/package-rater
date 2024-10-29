import { FastifyReply, FastifyRequest } from "fastify";
import unzipper from "unzipper";
import { getGithubRepo, getLogger, cloneRepo } from "@package-rater/shared";
import { createHash } from "crypto";
import { savePackage } from "../util.js";
import { writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";

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
  let packageName = "";
  let version = "";
  let id = "";
  try {
    if (Content) {
      const buffer = Buffer.from(Content, "base64");
      const files = await unzipper.Open.buffer(buffer);
      const packageJsonFile = files.files.find((file) => file.path === "package.json");
      if (!packageJsonFile) {
        logger.error("No package.json found in the package uploaded");
        reply.code(400).send({ error: "No package.json found in the package" });
        return;
      }
      const packageData = await packageJsonFile.buffer();
      const packageJson = JSON.parse(packageData.toString());
      packageName = packageJson.name;
      version = packageJson.version;
      if (!packageName || !version) {
        logger.error("Invalid package.json found in the package uploaded");
        reply.code(400).send({ error: "Invalid package.json found in the package" });
        return;
      }
      id = createHash("sha256")
        .update(packageName + version)
        .digest("hex");
      const tempPath = tmpdir();
      await writeFile(`${tempPath}/${id}.zip`, buffer);
      const result = await savePackage(packageName, version, id, tempPath);
      if (result.success === false) {
        logger.error(`Error saving the package: ${result.reason}`);
        reply.code(500).send({ error: "Error saving the package" });
        return;
      }
    } else {
      const githubURL = await getGithubRepo(URL);
      const repoDir = await cloneRepo(githubURL, "repo");
      if (!repoDir) {
        logger.error("Error cloning the repository");
        reply.code(400).send({ error: "Error cloning the repository" });
        return;
      }
      const packageJsonFile = await readFile(`${repoDir}/package.json`);
      await rm(repoDir, { recursive: true });
      if (!packageJsonFile) {
        logger.error("No package.json found in the package uploaded");
        reply.code(400).send({ error: "No package.json found in the package" });
        return;
      }
      const packageJson = JSON.parse(packageJsonFile.toString());
      packageName = packageJson.name;
      version = packageJson.version;
      if (!packageName || !version) {
        logger.error("Invalid package.json found in the package uploaded");
        reply.code(400).send({ error: "Invalid package.json found in the package" });
        return;
      }
      id = createHash("sha256")
        .update(packageName + version)
        .digest("hex");
      const result = await savePackage(packageName, version, id, undefined, URL);
      if (result.success === false) {
        logger.error(`Error saving the package: ${result.reason}`);
        reply.code(500).send({ error: "Error saving the package" });
        return;
      }
    }
    if (debloat) {
      logger.info("Debloating not implemented yet");
    }
  } catch (error) {
    logger.error("Error uploading the package:", error);
    reply.code(500).send({ error: "Error uploading the package" });
    return;
  }
  reply.code(201).send({ metadata: { Name: package } });
};
