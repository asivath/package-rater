import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { uploadPackage } from "./routes/uploadPackage.js";
import { retrievePackageInfo, retrievePackageByRegEx } from "./routes/retrievePackages.js";
import { resetPackages } from "./routes/resetPackages.js";
import { downloadPackage } from "./routes/downloadPackage.js";
import { getPackageCost } from "./routes/getPackageCost.js";
import { uploadVersion } from "./routes/uploadVersion.js";
import { retrievePackageNetscore } from "./routes/retrievePackageNetscore.js";
import { getLogger } from "@package-rater/shared";
import NodeCache from "node-cache";
import { readFile, writeFile } from "fs/promises";
import "dotenv/config";
import fastifyRateLimit from "@fastify/rate-limit";

export const cache = new NodeCache({ stdTTL: 60 * 60 });

const logger = getLogger("server");

const fastify = Fastify({
  logger: {
    level: "debug",
    file: "server.log",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: false,
        destination: "server.log"
      }
    }
  },
  bodyLimit: 30 * 1024 * 1024, // 30MB,
  keepAliveTimeout: 60000
});

fastify.addHook("preHandler", async (request) => {
  if (request.method === "OPTIONS") {
    return;
  }
  request.log.info(
    {
      body: request.body
    },
    "Parsed Request Body"
  );
});

fastify.addHook("onRequest", async (request) => {
  if (request.method === "OPTIONS") {
    return;
  }
  request.log.info(
    {
      method: request.method,
      url: request.url,
      headers: request.headers
    },
    "Request details"
  );
});

fastify.addHook("onResponse", async (request, reply) => {
  if (request.method === "OPTIONS") {
    return;
  }
  request.log.info(
    {
      statusCode: reply.statusCode,
      url: request.url,
      method: request.method
    },
    "Response details"
  );
});

fastify.addHook("onSend", async (request, _reply, payload) => {
  if (request.method === "OPTIONS") {
    return;
  }
  request.log.info(
    {
      responseBody: payload
    },
    "Response Body"
  );
  return payload;
});

await fastify.register(cors, {
  origin: ["http://127.0.0.1:3000", "http://localhost:5173", process.env.CLOUDFRONT_ORIGIN].filter(Boolean),
  methods: ["GET", "POST", "PUT", "OPTIONS", "DELETE"]
});

await fastify.register(fastifyRateLimit, {
  max: 600,
  timeWindow: "1 minute"
});

fastify.register(fastifyStatic, {
  root: process.cwd() + "/../app/dist",
  prefix: "/"
});

fastify.delete("/log", async (_, reply) => {
  await writeFile("server.log", "");
  await writeFile("../package-rater.log", "");
  reply.code(200).send({ message: "Server log cleared" });
});
fastify.get("/server-log", async (_, reply) => {
  const log = await readFile("server.log", "utf-8");
  reply.code(200).send(log);
});
fastify.get("/package-rater-log", async (_, reply) => {
  const log = await readFile("../package-rater.log", "utf-8");
  reply.code(200).send(log);
});
fastify.post("/package", uploadPackage);
fastify.post("/packages", retrievePackageInfo);
fastify.post("/package/byRegEx", retrievePackageByRegEx);
fastify.get("/package/:id", downloadPackage);
fastify.delete("/reset", resetPackages);
fastify.get("/package/:id/cost", getPackageCost);
fastify.post("/package/:id", uploadVersion);
fastify.get("/package/:id/rate", retrievePackageNetscore);
fastify.get("/tracks", async (_, reply) => {
  try {
    reply.code(200).send({
      plannedTracks: ["Performance track"]
    });
  } catch (err) {
    logger.error(err);
    reply
      .code(500)
      .send({ error: "The system encountered an error while retrieving the student's track information." });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};
start();
