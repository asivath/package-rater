import { describe, it, expect, vi, Mock, beforeEach } from "vitest";
import { getGithubRepo } from "../util";
import { getLogger } from "../logger";

global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getGithubRepo", () => {
  const logger = getLogger("test");

  it("should return the GitHub URL if a valid GitHub URL is provided", async () => {
    const url = "https://github.com/owner/repo";
    const result = await getGithubRepo(url);
    expect(result).toBe(url);
  });

  it("should fetch GitHub URL from npm registry if provided an npm URL", async () => {
    const npmUrl = "https://www.npmjs.com/package/example-package";
    const expectedGithubUrl = "https://github.com/owner/repo";

    // Mock the fetch response for npm URL
    (fetch as unknown as Mock).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        "dist-tags": { latest: "1.0.0" },
        versions: {
          "1.0.0": {
            repository: {
              url: expectedGithubUrl
            }
          }
        }
      })
    });

    const result = await getGithubRepo(npmUrl);
    expect(result).toBe(expectedGithubUrl);
  });

  it("should throw an error if the npm package does not have a GitHub repository", async () => {
    const npmUrl = "https://www.npmjs.com/package/example-package";

    // Mock the fetch response without a GitHub repo
    (fetch as unknown as Mock).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({
        "dist-tags": { latest: "1.0.0" },
        versions: {
          "1.0.0": {
            // No repository field
          }
        }
      })
    });

    await expect(getGithubRepo(npmUrl)).rejects.toThrow("No GitHub repository found");
    expect(logger.error).toHaveBeenCalledWith("No GitHub repository found");
  });

  it("should throw an error for invalid URLs", async () => {
    const invalidUrl = "https://not-a-valid-url.com";

    await expect(getGithubRepo(invalidUrl)).rejects.toThrow("Invalid URL: Not a GitHub or npm URL");
    expect(logger.error).toHaveBeenCalledWith("Invalid URL: Not a GitHub or npm URL");
  });
});
