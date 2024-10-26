/**
 * This file contains tests for the logger.ts file.
 */
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { getLogger, reinitializeLogger } from "../logger.ts";
import * as util from "util";
import * as fsPromises from "fs/promises";

vi.mock("util", async () => {
  return {
    promisify: vi.fn().mockReturnValue(vi.fn())
  };
});
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return {
    ...actual,
    readFile: vi.fn()
  };
});

const logFilePath = path.join("src", "__tests__", "logs", "test.log");

beforeAll(() => {
  const mockDate = new Date(2021, 1, 1);
  vi.setSystemTime(mockDate);
  process.env.LOG_FILE = logFilePath;
  process.env.NODE_ENV = "test";
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(async () => {
  await fs.rm(path.join("src", "__tests__", "logs"), { recursive: true, force: true });
});

describe("Logger Tests", () => {
  let logger: ReturnType<typeof getLogger>;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    reinitializeLogger();
    logger = getLogger("logger-test");
    debugSpy = vi.spyOn(logger, "debug");
    infoSpy = vi.spyOn(logger, "info");
    consoleLogSpy = vi.spyOn(console, "log");
  });

  afterEach(() => {
    debugSpy.mockClear();
    infoSpy.mockClear();
    consoleLogSpy.mockClear();
  });

  it("should log an info message", async () => {
    const testMessage = { key: "value" };
    await fs.writeFile(logFilePath, "");

    logger.info(testMessage);

    // Assert that the info method was called with the expected message
    expect(infoSpy).toHaveBeenCalledWith(testMessage);
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("should log a debug message", async () => {
    const testMessage = { key: "value" };
    await fs.writeFile(logFilePath, "");

    logger.debug(testMessage);

    // Assert that the debug method was called with the expected message
    expect(debugSpy).toHaveBeenCalledWith(testMessage);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
