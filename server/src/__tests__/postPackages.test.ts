import { describe, it, expect, vi, beforeEach } from "vitest";
import { postPackages, satisfiesCarat, satisfiesTilde, satisfiesRange } from "../routes/postPackages";
import Fastify from "fastify";

vi.mock("fs/promises", () => ({
  readFile: vi.fn(() => Promise.resolve(JSON.stringify(mockMetadataJson)))
}));

const mockMetadataJson = {
  byId: {
    id1: {
      Name: "express",
      Version: "1.0.0",
      ndjson: "ndjson"
    },
    id2: {
      Name: "new-package-1",
      Version: "2.0.0",
      ndjson: "ndjson"
    },
    id3: {
      Name: "new-package-1",
      Version: "2.5.0",
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

describe("postPackages", () => {
  const fastify = Fastify();
  fastify.post("/packages", postPackages);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return paginated packages when "*" is requested', async () => {
    const body = [{ Name: "*" }];

    const reply = await fastify.inject({
      method: "POST",
      url: "/packages",
      body: body
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual([
      {
        ID: "id1",
        Name: "express",
        Version: "1.0.0"
      },
      {
        ID: "id2",
        Name: "express",
        Version: "2.0.0"
      },
      {
        ID: "id3",
        Name: "express",
        Version: "2.5.0"
      }
    ]);
  });

  it("should return 400 when offset is invalid", async () => {
    const body = [{ Name: "*" }];

    const reply = await fastify.inject({
      method: "POST",
      url: "/packages",
      body: body,
      headers: { offset: "invalid" }
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({
      error: "Invalid offset value"
    });
  });

  it("should return 400 when package requests are missing or invalid", async () => {
    const body = [];

    const reply = await fastify.inject({
      method: "POST",
      url: "/packages",
      body: body
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.json()).toEqual({
      error: "Missing or invalid array of package objects"
    });
  });

  it("should skip to the next package if not found", async () => {
    const body = [{ Name: "react", Version: "^3.0.0" }];

    const reply = await fastify.inject({
      method: "POST",
      url: "/packages",
      body: body
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual([]);
  });

  it("should handle specific package requests with ^ valid pagination", async () => {
    const body = [{ Name: "express", Version: "^2.0.0" }];

    const reply = await fastify.inject({
      method: "POST",
      url: "/packages",
      body: body,
      headers: { offset: "0" }
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual([
      {
        ID: "id2",
        Name: "express",
        Version: "2.0.0"
      },
      {
        ID: "id3",
        Name: "express",
        Version: "2.5.0"
      }
    ]);
  });

  it("should handle specific package requests with ~ valid pagination", async () => {
    const body = [{ Name: "express", Version: "~2.0.0" }];

    const reply = await fastify.inject({
      method: "POST",
      url: "/packages",
      body: body,
      headers: { offset: "0" }
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual([
      {
        ID: "id2",
        Name: "express",
        Version: "2.0.0"
      }
    ]);
  });

  it("should handle specific package requests with range valid pagination", async () => {
    const body = [{ Name: "express", Version: "2.0.0-2.6.0" }];

    const reply = await fastify.inject({
      method: "POST",
      url: "/packages",
      body: body,
      headers: { offset: "0" }
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual([
      {
        ID: "id2",
        Name: "express",
        Version: "2.0.0"
      },
      {
        ID: "id3",
        Name: "express",
        Version: "2.5.0"
      }
    ]);
  });
});

describe("Helper functions", () => {
  it("satisfiesCarat should return true for matching major versions", () => {
    expect(satisfiesCarat("4.17.1", "4")).toBe(true);
    expect(satisfiesCarat("5.0.0", "4")).toBe(false);
  });

  it("satisfiesTilde should return true for matching major and minor versions", () => {
    expect(satisfiesTilde("6.0.5", "6.0")).toBe(true);
    expect(satisfiesTilde("6.1.0", "6.0")).toBe(false);
  });

  it("satisfiesRange should return true for versions within range", () => {
    expect(satisfiesRange("5.1.0", "5.0.0", "5.2.0")).toBe(true);
    expect(satisfiesRange("5.3.0", "5.0.0", "5.2.0")).toBe(false);
  });
});
