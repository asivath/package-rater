import { describe, it, expect, vi, beforeEach } from "vitest";
import { deletePackage } from "../routes/deletePackage";
import Fastify from "fastify";

vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(mockMetadataJson))),
  writeFile: vi.fn().mockResolvedValue(undefined)
}));

const mockMetadataJson = {
  byId: {
    id1: {
      packageName: "express",
      version: "1.0.0",
      ndjson: "ndjson"
    },
    id2: {
      packageName: "express",
      version: "2.0.0",
      ndjson: "ndjson"
    },
    id3: {
      packageName: "express",
      version: "2.5.0",
      ndjson: "ndjson"
    }
  },
  byName: {
    express: {
      "1.0.0": {
        id: "id1",
        ndjson: "ndjson"
      },
      "2.0.0": {
        id: "id2",
        ndjson: "ndjson"
      },
      "2.5.0": {
        id: "id3",
        ndjson: "ndjson"
      }
    }
  }
};

// Test Suite
describe("deletePackage", () => {
  const fastify = Fastify();
  fastify.delete("/package/:id", deletePackage);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 if no package ID is provided", async () => {
    const reply = await fastify.inject({
      method: "DELETE",
      url: "/package/"
    });

    expect(reply.statusCode).toBe(400);
  });

  it("should return 404 if package does not exist", async () => {
    const reply = await fastify.inject({
      method: "DELETE",
      url: "/package/hawk"
    });

    expect(reply.statusCode).toBe(404);
  });

  it("should delete package and return 200 on success", async () => {
    const reply = await fastify.inject({
      method: "DELETE",
      url: "/package/id1"
    });

    expect(reply.statusCode).toBe(200);
  });

  it("should return 500 if an error occurs while deleting", async () => {});
});
