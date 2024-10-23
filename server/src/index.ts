import Fastify from "fastify";
import cors from "@fastify/cors";
import { uploadPackage } from "./routes/uploadPackage.js";
import { promises as fs } from "fs";
import { dirname } from "path";
import path from "path";
import { fileURLToPath } from "url";

const fastify = Fastify({
  logger: false,
  bodyLimit: 30 * 1024 * 1024 // 30MB
});

fastify.register(cors, {
  origin: process.env.APP_ORIGIN || "http://localhost:5173",
  methods: ["POST", "GET", "OPTIONS"]
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
