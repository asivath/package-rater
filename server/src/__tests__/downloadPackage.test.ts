import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadPackage } from "../routes/downloadPackage";
import Fastify from "fastify";
import * as shared from "@package-rater/shared";
import * as fs from "fs/promises";

const mockMetadataJson = vi.hoisted(() => ({
  byId: {
    "completed-ID": {
      packageName: "completed-package",
      version: "1.0.0",
      ndjson: {
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
        GoodPinningPractice: 1,
        GoodPinningPracticeLatency: 1,
        PullRequest: 1,
        PullRequest_Latency: 1
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
        GoodPinningPractice: 1,
        GoodPinningPracticeLatency: 1,
        PullRequest: 1,
        PullRequest_Latency: 1
      },
      dependencies: {},
      standaloneCost: 0.5,
      totalCost: 1.5,
      costStatus: "pending"
    }
  },
  byName: {
    "completed-package": {
      uploadedWithContent: false,
      versions: {
        "1.0.0": {
          id: "completed-ID",
          ndjson: {
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
            GoodPinningPractice: 1,
            GoodPinningPracticeLatency: 1,
            PullRequest: 1,
            PullRequest_Latency: 1
          },
          dependencies: {},
          standaloneCost: 0.5,
          totalCost: 0.5,
          costStatus: "completed"
        }
      }
    },
    "initiated-package": {
      uploadedWithContent: false,
      versions: {
        "1.0.0": {
          id: "initiated-ID",
          ndjson: {
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
            GoodPinningPractice: 1,
            GoodPinningPracticeLatency: 1,
            PullRequest: 1,
            PullRequest_Latency: 1
          },
          dependencies: {},
          standaloneCost: 0.5,
          totalCost: 0,
          costStatus: "completed"
        }
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
vi.mock("adm-zip", () => ({
  default: vi.fn().mockImplementation(() => ({
    addLocalFolder: vi.fn(),
    toBuffer: vi.fn().mockReturnValue({
      toString: vi.fn().mockReturnValue("test-content")
    }),
    readFile: vi.fn(),
    readFileAsync: vi.fn(),
    readAsText: vi.fn(),
    readAsTextAsync: vi.fn()
  }))
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
    send: vi.fn().mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue("test-content"),
        transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array(Buffer.from("test-content")))
      }
    })
  })),
  GetObjectCommand: vi.fn()
}));
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("test-content"))
}));
vi.mock("../index", () => ({
  cache: {
    flushAll: vi.fn(),
    get: vi.fn(),
    set: vi.fn()
  }
}));
vi.mock("../util", () => ({
  getPackageMetadata: vi.fn().mockReturnValue(mockMetadataJson)
}));

describe("downloadPackage", () => {
  const fastify = Fastify();
  fastify.get("/packages/:id", downloadPackage);

  beforeEach(() => {
    process.env.NODE_ENV = "development";
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
      url: "/packages/id2"
    });

    expect(reply.statusCode).toBe(404);
    expect(reply.json()).toEqual({
      error: "Package does not exist"
    });
  });

  it("should return 200 with metadata and base64 data when package exists (in development mode)", async () => {
    process.env.NODE_ENV = "development";

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
    // base64 encoding of "test-content"
    expect(responseData.data.Content).toEqual("dGVzdC1jb250ZW50");
  });

  it("should return 200 with metadata and base64 data when package exists (in production mode)", async () => {
    process.env.NODE_ENV = "production";

    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/completed-ID"
    });

    expect(reply.statusCode).toBe(200);

    // Validate the response
    const responseData = reply.json();
    expect(responseData.metadata).toEqual({
      Name: "completed-package",
      Version: "1.0.0",
      ID: "completed-ID"
    });
    // base64 encoding of "test-content"
    expect(responseData.data.Content).toEqual("dGVzdC1jb250ZW50");
  });

  it("should return 500 if there is an error in the process", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("Error reading file"));

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
