import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import * as shared from "@package-rater/shared";
import { getPackageMetadata } from "../util";
import { deletePackage } from "../routes/deletePackage";
import Fastify from "fastify";
import { S3Client } from "@aws-sdk/client-s3";
import { getLogger } from "@package-rater/shared";

// Corrected mockMetadataJson with ndjson as an object
const mockMetadataJson = vi.hoisted(() => ({
  byId: {
    "completed-ID": {
      packageName: "completed-package",
      version: "1.0.0",
      ndjson: {
        URL: "string",
        NetScore: 1,
        NetScore_Latency: 1,
        RampUp: 1,
        RampUp_Latency: 1,
        Correctness: 1,
        Correctness_Latency: 1,
        BusFactor: 1,
        BusFactor_Latency: 1,
        ResponsiveMaintainer: 1,
        ResponsiveMaintainer_Latency: 1,
        License: 1,
        License_Latency: 1,
        Dependencies: 1,
        Dependencies_Latency: 1
      },
      dependencies: { "completed-dep": "1.0.0" },
      standaloneCost: 0.5,
      totalCost: 1.5,
      costStatus: "completed" // Ensuring costStatus is "completed"
    },
    "initiated-ID": {
      packageName: "initiated-package",
      version: "1.0.0",
      ndjson: {
        URL: "string",
        NetScore: 1,
        NetScore_Latency: 1,
        RampUp: 1,
        RampUp_Latency: 1,
        Correctness: 1,
        Correctness_Latency: 1,
        BusFactor: 1,
        BusFactor_Latency: 1,
        ResponsiveMaintainer: 1,
        ResponsiveMaintainer_Latency: 1,
        License: 1,
        License_Latency: 1,
        Dependencies: 1,
        Dependencies_Latency: 1
      },
      dependencies: {},
      standaloneCost: 0.5,
      totalCost: 1.5,
      costStatus: "pending" // Changed to "pending" from "initiated"
    }
  },
  byName: {
    "completed-package": {
      "1.0.0": {
        id: "completed-ID",
        ndjson: {
          URL: "string",
          NetScore: 1,
          NetScore_Latency: 1,
          RampUp: 1,
          RampUp_Latency: 1,
          Correctness: 1,
          Correctness_Latency: 1,
          BusFactor: 1,
          BusFactor_Latency: 1,
          ResponsiveMaintainer: 1,
          ResponsiveMaintainer_Latency: 1,
          License: 1,
          License_Latency: 1,
          Dependencies: 1,
          Dependencies_Latency: 1
        },
        dependencies: {},
        standaloneCost: 0.5,
        totalCost: 0.5,
        costStatus: "completed" // Ensuring costStatus is "completed"
      }
    },
    "initiated-package": {
      "1.0.0": {
        id: "initiated-ID",
        ndjson: {
          URL: "string",
          NetScore: 1,
          NetScore_Latency: 1,
          RampUp: 1,
          RampUp_Latency: 1,
          Correctness: 1,
          Correctness_Latency: 1,
          BusFactor: 1,
          BusFactor_Latency: 1,
          ResponsiveMaintainer: 1,
          ResponsiveMaintainer_Latency: 1,
          License: 1,
          License_Latency: 1,
          Dependencies: 1,
          Dependencies_Latency: 1
        },
        dependencies: {},
        standaloneCost: 0.5,
        totalCost: 0,
        costStatus: "pending" // Changed to "pending" from "initiated"
      }
    }
  },
  costCache: {
    "2985548229775954": {
      // completed-dep-1.0.0
      totalCost: 1.5,
      standaloneCost: 1.5,
      dependencies: [],
      costStatus: "completed" // Ensuring costStatus is "completed"
    }
  }
}));

// Mocking shared functions and classes
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

// Mocking filesystem and AWS S3 SDK modules
vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(mockMetadataJson))),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(() => Promise.resolve([])),
  mkdir: vi.fn()
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn()
  })),
  DeleteObjectsCommand: vi.fn()
}));

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
      url: "/package/completed-ID"
    });

    expect(logger.info).toHaveBeenCalledWith("Deleted completed-package from S3.");
    expect(reply.statusCode).toBe(200);
  });

  it("should delete package locally and return 200 on success (non-prod)", async () => {
    process.env.NODE_ENV = "dev";

    const reply = await fastify.inject({
      method: "DELETE",
      url: "/package/initiated-ID"
    });

    const metadata = getPackageMetadata();

    expect(metadata).toEqual({
      byId: {},
      byName: {},
      costCache: {
        "2985548229775954": {
          costStatus: "completed",
          dependencies: [],
          standaloneCost: 1.5,
          totalCost: 1.5
        }
      }
    });

    expect(reply.statusCode).toBe(200);
  });
});
