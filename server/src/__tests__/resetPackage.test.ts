import { describe, it, vi, Mock, expect, beforeEach } from "vitest";
import * as util from "../util";
import * as shared from "@package-rater/shared";
import Fastify from "fastify";
import { resetPackages } from "../routes/resetPackages";
import { S3Client } from "@aws-sdk/client-s3";
import { getLogger } from "@package-rater/shared";

vi.mock("../util", () => ({
  clearMetadata: vi.fn().mockResolvedValue(undefined)
}));
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
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(() => Promise.resolve({ Contents: [] }))
  })),
  DeleteObjectsCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(() => Promise.resolve({ Contents: ["something"], IsTruncated: false }))
}));
vi.mock("fs/promises", () => ({
  readdir: vi.fn().mockResolvedValue([]),
  rm: vi.fn().mockResolvedValue(undefined)
}));

describe("resetPackages", () => {
  const fastify = Fastify();
  fastify.delete("/reset", resetPackages);

  const logger = getLogger("test");

  let mockS3Client: S3Client;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "production";
    mockS3Client = new S3Client();
  });

  it("should reset local packages successfully", async () => {
    process.env.NODE_ENV = "dev";

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/reset"
    });

    expect(logger.info).toHaveBeenCalledWith("Local packages cleared successfully");
    expect(reply.statusCode).toBe(200);
  });

  it("should reset S3 and local packages successfully when in prod", async () => {
    (mockS3Client.send as Mock).mockResolvedValueOnce({
      Contents: [{ Key: "package1.ndjson" }, { Key: "package2.ndjson" }]
    });

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/reset"
    });

    expect(logger.info).toHaveBeenCalledWith("S3 bucket cleared successfully");
    expect(reply.statusCode).toBe(200);
  });

  it("should handle errors gracefully and return a 500 status", async () => {
    (util.clearMetadata as Mock).mockImplementationOnce(() => {
      throw new Error("Simulated write error");
    });

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/reset"
    });

    expect(logger.error).toHaveBeenCalledWith("Failed to reset packages", expect.any(Error));
    expect(reply.statusCode).toBe(500);
  });
});
