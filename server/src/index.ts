import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { uploadPackage } from "./routes/uploadPackage.js";
import { postPackages } from "./routes/postPackages.js";
import { deletePackage } from "./routes/deletePackage.js";
import { resetPackages } from "./routes/resetPackages.js";
import { downloadPackage } from "./routes/downloadPackage.js";
import { getPackageCost } from "./routes/getPackageCost.js";
import { getLogger } from "@package-rater/shared";
import "dotenv/config";

const logger = getLogger("server");

const fastify = Fastify({
  logger: false,
  bodyLimit: 30 * 1024 * 1024 // 30MB
});

fastify.register(cors, {
  origin: ["http://127.0.0.1:3000", "http://localhost:5173", process.env.CLOUDFRONT_ORIGIN].filter(Boolean),
  methods: ["GET", "POST", "PUT", "OPTIONS", "DELETE"]
});

fastify.register(fastifyStatic, {
  root: process.cwd() + "/../app/dist",
  prefix: "/"
});

fastify.post("/package", uploadPackage);
fastify.post("/packages", postPackages);
fastify.get("/package/:id", downloadPackage);
fastify.delete("/package/:id", deletePackage);
fastify.delete("/reset", resetPackages);
fastify.get("/package/:id/cost", getPackageCost);

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};
start();
