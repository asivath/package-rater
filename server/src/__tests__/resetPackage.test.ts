import { describe, it, vi, Mock, expect, beforeEach } from "vitest";
import * as shared from "@package-rater/shared";
import { FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { resetPackages } from "../routes/resetPackages"; // Adjust the path as needed
import { readFile, writeFile, readdir, rm } from "fs/promises";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getLogger } from "@package-rater/shared";

// Mock the logger
vi.mock("@package-rater/shared", async (importOriginal) => {
  const original = await importOriginal<typeof shared>();
  return {
    ...original,
    getLogger: vi.fn().mockReturnValue({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  };
});

// Mock AWS SDK client and commands
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(() => Promise.resolve({ Contents: []})),
  })),
  DeleteObjectsCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(() => Promise.resolve({ Contents: ["something"], IsTruncated: false })),
}));

// Mock fs/promises methods
vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(mockMetadataJson))),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(() => Promise.resolve([])), // Mock an empty directory after deletion
}));

const mockMetadataJson = {
  byId: {
    id1: {
      packageName: "express",
      version: "1.0.0",
      ndjson: "ndjson",
    },
  },
  byName: {
    express: {
      "1.0.0": {
        id: "id1",
        ndjson: "ndjson",
      },
    },
  },
};

describe("resetPackages", () => {
  const fastify = Fastify();
  fastify.delete("/reset", resetPackages);

  const logger = getLogger("test");

  let mockS3Client: S3Client;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "prod"; // Set to 'prod' for testing S3 deletion
    mockS3Client = new S3Client();
  });

  it("should reset local packages successfully", async () => {
    process.env.NODE_ENV = "dev"; // Simulate non-prod environment

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/reset",
    });

    expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({ byId: {}, byName: {} }, null, 2)
    );

    expect(logger.info).toHaveBeenCalledWith("Local packages cleared successfully");
    expect(reply.statusCode).toBe(200);
  });

  it("should reset S3 and local packages successfully when in prod", async () => {
    (mockS3Client.send as Mock).mockResolvedValueOnce({
      Contents: [{ Key: "package1.ndjson" }, { Key: "package2.ndjson" }],
    });

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/reset",
    });

    expect(logger.info).toHaveBeenCalledWith("S3 bucket cleared successfully");
    expect(reply.statusCode).toBe(200);
  });

  it("should handle errors gracefully and return a 500 status", async () => {
    (writeFile as Mock).mockImplementationOnce(() => {
      throw new Error("Simulated write error");
    });

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/reset",
    });

    // Verify the logger captured the error
    expect(logger.error).toHaveBeenCalledWith("Failed to reset packages", expect.any(Error));
    expect(reply.statusCode).toBe(500);
  });
});
