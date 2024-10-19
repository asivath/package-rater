import Fastify from "fastify";

const fastify = Fastify({
  logger: false
});

fastify.get("/", async (_request, _reply) => {
  return { hello: "bye" };
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
