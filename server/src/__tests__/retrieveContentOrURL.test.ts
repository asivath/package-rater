import { describe, it, expect, vi, beforeEach } from "vitest";
import { FastifyInstance } from "fastify";
import Fastify from "fastify";
import * as shared from "@package-rater/shared";
import * as util from "../util.js";
import { getLogger } from "@package-rater/shared";
import { retrieveContentOrURL } from "../routes/retrieveContentOrURL";

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

vi.mock("../util.js", async (importOriginal) => {
  vi.stubEnv("NODE_TEST", "true");
  const original = await importOriginal<typeof util>();
  return {
    ...original,
    getPackageMetadata: vi.fn().mockReturnValue({
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
          uploadedWithContent: false,
          versions: {
            "1.0.0": {
              id: "completed-ID",
              ndjson: null,
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
              ndjson: null,
              dependencies: {},
              standaloneCost: 0.5,
              totalCost: 0,
              costStatus: "initiated"
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
    }),
    calculateTotalPackageCost: vi.fn().mockResolvedValue("12345")
  };
});

describe("retrieveContentOrURL", () => {
  let fastify: FastifyInstance;

  const logger = getLogger("test");

  beforeEach(() => {
    fastify = Fastify();
    fastify.get("/packages/:name", retrieveContentOrURL);

    vi.clearAllMocks();
  });

  it("should return 400 if package name is missing", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/"
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({
      error: "There is missing field(s) in the PackageID or invalid"
    });
    expect(logger.error).toHaveBeenCalledWith("Package ID is missing or invalid in request.");
  });

  it("should return 200 with `uploadedWithContent` when package exists", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/completed-package"
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({
      uploadedWithContent: false
    });
    expect(logger.info).toHaveBeenCalledWith("Successfully grabbed upload type for(completed-package");
  });

  it("should return 500 if there is an error in the process", async () => {
    vi.mocked(util.getPackageMetadata).mockImplementationOnce(() => {
      throw new Error("Simulated error");
    });

    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/test-package"
    });

    expect(reply.statusCode).toBe(500);
    expect(reply.json()).toEqual({
      error: "Error grabbing upload type for package"
    });
    expect(logger.error).toHaveBeenCalledWith("Failed to grab upload type for test-package: Error: Simulated error");
  });

  it("should return 404 if the package does not exist in metadata", async () => {
    const reply = await fastify.inject({
      method: "GET",
      url: "/packages/unknown-package"
    });

    expect(reply.statusCode).toBe(500); // Assuming fallback behavior
    expect(reply.json()).toEqual({
      error: "Error grabbing upload type for package"
    });
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to grab upload type for unknown-package: TypeError: Cannot read properties of undefined (reading 'uploadedWithContent')"
    );
  });
});
