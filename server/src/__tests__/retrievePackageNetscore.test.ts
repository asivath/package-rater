import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrievePackageNetscore } from "../routes/retrievePackageNetscore";
import Fastify from "fastify";

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
          costStatus: "pending"
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

// Mocking filesystem and AWS S3 SDK modules
vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(mockMetadataJson))),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(() => Promise.resolve([])),
  mkdir: vi.fn()
}));

describe("retrievePackageNetscore", () => {
  const fastify = Fastify();
  fastify.get("/package/:id/rate", retrievePackageNetscore);

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NODE_ENV = "production";
  });

  it("should return 400 if no package ID is provided", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/package//rate"
    });

    expect(reply.statusCode).toBe(400);
  });

  it("should return 404 if package does not exist", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/package/nonexistent-id/rate"
    });

    expect(reply.statusCode).toBe(404);
  });

  it("should retrieve netscore info successfully", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/package/completed-ID/rate"
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({
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
    });
  });
});
