import Fastify from "fastify";
import { uploadPackage } from "./routes/uploadPackage.js";

const fastify = Fastify({
  logger: false
});

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
