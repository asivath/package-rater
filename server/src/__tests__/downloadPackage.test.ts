import { describe, it, expect, vi, beforeEach } from "vitest";
import * as shared from "@package-rater/shared";
import { downloadPackage } from "../routes/downloadPackage";
import Fastify from "fastify";
import * as fs from "fs/promises";

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
      costStatus: "completed"
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
      costStatus: "pending"
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
        costStatus: "completed"
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
        costStatus: "completed"
      }
    }
  },
  costCache: {
    "2985548229775954": {
      // completed-dep-1.0.0
      totalCost: 1.5,
      standaloneCost: 1.5,
      dependencies: [],
      costStatus: "completed"
    }
  }
}));

// Mocking the dependencies
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
    send: vi.fn().mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue("test-package-data") // Mock the transformToString method
      }
    }) // Mock send method with Body that has transformToString
  })),
  GetObjectCommand: vi.fn()
}));

vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(mockMetadataJson))),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(() => Promise.resolve([])),
  mkdir: vi.fn()
}));

describe("downloadPackage", () => {
  let fastify;

  beforeEach(() => {
    // Reset the environment variable and Fastify instance before each test
    process.env.NODE_ENV = "development"; // Default environment
    fastify = Fastify();
    fastify.get("/packages/:id", downloadPackage);
    vi.clearAllMocks();
  });

  it("should return 400 if PackageID is missing", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/"
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({
      error: "There is missing field(s) in the PackageID or it is formed improperly, or is invalid."
    });
  });

  it("should return 404 if package does not exist", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/id2" // Non-existing package ID
    });

    expect(reply.statusCode).toBe(404);
    expect(reply.json()).toEqual({
      error: "Package does not exist"
    });
  });

  it("should return 200 with metadata and base64 data when package exists (in development mode)", async () => {
    // Mock both metadata.json and package data
    vi.mocked(fs.readFile).mockResolvedValueOnce("test-content");

    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/completed-ID"
    });

    expect(reply.statusCode).toBe(200);
    const responseData = reply.json();
    expect(responseData.metadata).toEqual({
      Name: "completed-package",
      Version: "1.0.0",
      ID: "completed-ID"
    });
    expect(responseData.data.Content).toBe("test-content"); // Base64 encoding of "test-package-data"
  });

  it("should return 200 with metadata and base64 data when package exists (in production mode)", async () => {
    process.env.NODE_ENV = "production";

    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/completed-ID"
    });

    // Check the return status and ensure the mock worked correctly
    expect(reply.statusCode).toBe(200);
  });

  it("should return 500 if there is an error in the process", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValueOnce(new Error("Simulated read error"));

    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/completed-ID"
    });

    expect(reply.statusCode).toBe(500);
    expect(reply.json()).toEqual({
      error: "Internal server error"
    });
  });
});
