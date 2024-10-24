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
  process.env.LOG_LEVEL = "2";
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
    logger = getLogger("level3");
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
    process.env.LOG_LEVEL = "0";
    const testMessage = { key: "value" };
    await fs.writeFile(logFilePath, "");

    logger.debug(testMessage);

    // Assert that the debug method was called with the expected message
    expect(debugSpy).toHaveBeenCalledWith(testMessage);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("should not log a debug message and log an info message when log level is 1", async () => {
    process.env.LOG_LEVEL = "1";
    reinitializeLogger();
    logger = getLogger("level1");
    await fs.writeFile(logFilePath, "");

    logger.debug("This is a debug message");
    logger.info("This is an info message");

    const logContents = await fs.readFile(logFilePath, "utf-8");
    expect(logContents).toBe(`01/02/2021 00:00:00 [info] [level1]: This is an info message\n`);
  });

  it("should not log a debug message and log an info message when log level is 2", async () => {
    process.env.LOG_LEVEL = "2";
    reinitializeLogger();
    logger = getLogger("level2");
    await fs.writeFile(logFilePath, "");

    logger.debug("This is a debug message");
    logger.info("This is an info message");

    const logContents = await fs.readFile(logFilePath, "utf-8");
    expect(logContents).toBe("");
  });

  it("should not log a debug message and log an info message when log level is 0", async () => {
    process.env.LOG_LEVEL = "0";
    reinitializeLogger();
    logger = getLogger("level0");
    await fs.writeFile(logFilePath, "");

    logger.debug("This is a debug message");
    logger.info("This is an info message");

    const logContents = await fs.readFile(logFilePath, "utf-8");
    expect(logContents).toBe("");
  });
});
