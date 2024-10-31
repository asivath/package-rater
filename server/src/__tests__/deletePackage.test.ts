import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import * as shared from "@package-rater/shared";
import { deletePackage } from "../routes/deletePackage";
import Fastify from "fastify";
import { S3Client } from "@aws-sdk/client-s3";
import { readFile, writeFile, rm } from "fs/promises";
import { getLogger } from "@package-rater/shared";

vi.mock("@package-rater/shared", async (importOriginal) => {
  const original = await importOriginal<typeof shared>();
  return {
    ...original,
    getLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    })
  };
});

vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(mockMetadataJson))),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(() => Promise.resolve([]))
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn()
  })),
  DeleteObjectsCommand: vi.fn()
}));

const mockMetadataJson = {
  byId: {
    id1: {
      packageName: "express",
      version: "1.0.0",
      ndjson: "ndjson"
    }
  },
  byName: {
    express: {
      "1.0.0": {
        id: "id1",
        ndjson: "ndjson"
      }
    }
  }
};

describe("deletePackage", () => {
  const fastify = Fastify();
  fastify.delete("/package/:id", deletePackage);

  const logger = getLogger("test");

  let mockS3Client: S3Client;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "production";
    mockS3Client = new S3Client();
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
      url: "/package/nonexistent-id"
    });

    expect(reply.statusCode).toBe(404);
  });

  it("should delete package and return 200 on success (S3 deletion)", async () => {
    (mockS3Client.send as Mock).mockResolvedValueOnce({});

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/package/id1"
    });

    expect(logger.info).toHaveBeenCalledWith("Deleted express from S3.");
    expect(reply.statusCode).toBe(200);
  });

  it("should delete package locally and return 200 on success (non-prod)", async () => {
    process.env.NODE_ENV = "dev";

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/package/id1"
    });

    expect(rm).toHaveBeenCalledWith(expect.stringContaining("express/id1"), { recursive: true, force: true });

    expect(writeFile).toHaveBeenCalledWith(expect.any(String), JSON.stringify({ byId: {}, byName: {} }, null, 2));

    expect(reply.statusCode).toBe(200);
  });

  it("should return 500 if an error occurs while deleting", async () => {
    (readFile as Mock).mockImplementation(() => {
      throw new Error("Simulated read error");
    });

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/package/id1"
    });

    expect(reply.statusCode).toBe(500);
  });
});
