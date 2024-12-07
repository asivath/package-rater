import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { calculateBusFactor } from "../metrics/BusFactor";
import * as shared from "@package-rater/shared";

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

describe("Bus Factor Calculation", () => {
  global.fetch = vi.fn();
  const mockLogger = shared.getLogger("test");

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return 0 if no contributors are found", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue([])
    });

    const result = await calculateBusFactor("owner", "repo", 2000);
    expect(result).toBe(0);
    expect(mockLogger.info).toHaveBeenCalledWith("No contributors found for owner/repo. Returning 0.");
  });

  it("should return 0 if contributors are fewer than the desired bus factor", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue([
        { author: { login: "user1" }, total: 10 },
        { author: { login: "user2" }, total: 20 }
      ])
    });

    const result = await calculateBusFactor("owner", "repo", 10000);
    expect(result).toBe(0);
    expect(mockLogger.info).toHaveBeenCalledWith("Total contributors (2) is less than desired (3). Returning 0.");
  });

  it("should calculate a valid bus factor score", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue([
        { author: { login: "user1" }, total: 100 },
        { author: { login: "user2" }, total: 50 },
        { author: { login: "user3" }, total: 25 },
        { author: { login: "user4" }, total: 25 }
      ])
    });

    const result = await calculateBusFactor("owner", "repo", 10000);
    expect(result).toBeGreaterThan(0);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Bus factor for owner/repo:"));
  });

  it("should handle API errors gracefully", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      status: 500,
      ok: false,
      statusText: "Internal Server Error"
    });

    const result = await calculateBusFactor("owner", "repo", 2000);
    expect(result).toBe(0);
    expect(mockLogger.error).toHaveBeenCalledWith("Failed to fetch contributor stats: Internal Server Error");
  });
});
