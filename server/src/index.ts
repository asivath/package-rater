import Fastify from "fastify";
import { uploadPackage } from "./routes/uploadPackage.js";
import { promises as fs } from "fs";
import { dirname } from "path";
import path from "path";
import { fileURLToPath } from "url";

const fastify = Fastify({
  logger: false
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const metadataPath = path.join(__dirname, "..", "packages", "metadata.json");

try {
  await fs.access(metadataPath);
} catch {
  await fs.mkdir(dirname(metadataPath), { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify({}));
}

fastify.post("/package", uploadPackage);

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
