import { vi, describe, it, expect } from "vitest";
import Fastify from "fastify";
import { getPackageCost } from "../routes/getPackageCost";
import * as util from "../util.js";

vi.mock("../util.js", async (importOriginal) => {
  const original = await importOriginal<typeof util>();
  return {
    ...original,
    getMetadata: vi.fn().mockReturnValue({
      byId: {
        "completed-ID": {
          packageName: "completed-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: { "completed-dep": "1.0.0" },
          standaloneCost: 0.5,
          totalCost: 1.5,
          costStatus: "completed"
        },
        "initiated-ID": {
          packageName: "initiated-package",
          version: "1.0.0",
          ndjson: null,
          dependencies: {},
          standaloneCost: 0.5,
          totalCost: 1.5,
          costStatus: "initiated"
        }
      },
      byName: {
        "completed-package": {
          "1.0.0": {
            id: "completed-ID",
            ndjson: null,
            dependencies: {},
            standaloneCost: 0.5,
            totalCost: 0.5,
            costStatus: "completed"
          }
        },
        "initiated-package": {
          "1.0.0": {
            id: "initiated-ID",
            ndjson: null,
            dependencies: {},
            standaloneCost: 0.5,
            totalCost: 0,
            costStatus: "initiated"
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
    }),
    calculateTotalPackageCost: vi.fn().mockResolvedValue("12345")
  };
});
vi.mock("@package-rater/shared", () => ({
  assertIsPackageCostResponse: vi.fn(),
  getLogger: () => ({
    error: vi.fn()
  })
}));

describe("getPackageCost", () => {
  const fastify = Fastify();
  fastify.get("/package/:id/cost", getPackageCost);

  it("should return 404 if package is not found", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/package/12345/cost"
    });

    expect(reply.statusCode).toEqual(404);
    expect(reply.json()).toEqual({ error: "Package not found" });
  });

  it('should calculate cost if costStatus is not "completed"', async () => {
    const calculateTotalPackageCostSpy = vi.spyOn(util, "calculateTotalPackageCost");
    const reply = await fastify.inject({
      method: "GET",
      url: "/package/initiated-ID/cost"
    });

    expect(calculateTotalPackageCostSpy).toHaveBeenCalledWith("initiated-ID");
    expect(reply.statusCode).toEqual(200);
    expect(reply.json()).toEqual({ "initiated-ID": { totalCost: 1.5 } });
  });

  it('should return cached total cost if costStatus is "completed" and no dependency requested', async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/package/completed-ID/cost"
    });

    expect(reply.statusCode).toEqual(200);
    expect(reply.json()).toEqual({ "completed-ID": { totalCost: 1.5 } });
  });

  it("should collect and return dependency costs", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/package/completed-ID/cost?dependency=true"
    });

    expect(reply.statusCode).toEqual(200);
    expect(reply.json()).toEqual({
      "completed-ID": { standaloneCost: 0.5, totalCost: 1.5 },
      "2985548229775954": { standaloneCost: 1.5, totalCost: 1.5 }
    });
  });

  it("should handle errors and return 500 if an error occurs", async () => {
    vi.mocked(util.calculateTotalPackageCost).mockRejectedValue(new Error("Calculation error"));

    const reply = await fastify.inject({
      method: "GET",
      url: "/package/initiated-ID/cost"
    });

    expect(reply.statusCode).toEqual(500);
    expect(reply.json()).toEqual({ error: "Failed to calculate cost" });
  });
});
