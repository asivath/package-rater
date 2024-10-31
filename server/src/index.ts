import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { uploadPackage } from "./routes/uploadPackage.js";
import { postPackages } from "./routes/postPackages.js";
import { promises as fs } from "fs";
import { dirname } from "path";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const fastify = Fastify({
  logger: false,
  bodyLimit: 30 * 1024 * 1024 // 30MB
});

fastify.register(cors, {
  origin: ["http://127.0.0.1:3000", "http://localhost:5173", process.env.CLOUDFRONT_ORIGIN].filter(Boolean),
  methods: ["GET", "POST", "PUT", "OPTIONS"]
});

fastify.register(fastifyStatic, {
  root: process.cwd() + "/../app/dist",
  prefix: "/"
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const metadataPath = path.join(__dirname, "..", "packages", "metadata.json");
try {
  await fs.access(metadataPath);
} catch {
  await fs.mkdir(dirname(metadataPath), { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify({ byId: {}, byName: {} }));
}

fastify.post("/package", uploadPackage);
fastify.post("/packages", postPackages);

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
