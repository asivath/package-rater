import Fastify from "fastify";
import { uploadPackage } from "./routes/uploadPackage.js";
import { mkdir, access, constants } from "fs/promises";

const fastify = Fastify({
  logger: false
});

try {
  await access("./packages", constants.F_OK);
} catch {
  await mkdir("./packages");
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
