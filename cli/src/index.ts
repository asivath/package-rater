import { APIGatewayProxyHandler } from "aws-lambda";
import { spawn } from "child_process";
import fs from "fs/promises";
import path, { dirname } from "path";
import { getLogger } from "@package-rater/shared";
import calculateMetrics from "./metrics/Netscore.js";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = getLogger("cli");

async function runTests(): Promise<void> {
  try {
    const testProcess = spawn("yarn", ["test:coverage", "--reporter=json"], { stdio: ["pipe"] });

    let stdout = "";
    let stderr = "";

    testProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    testProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    await new Promise<void>((resolve, reject) => {
      testProcess.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(stderr));
        }
        resolve();
      });
    });

    const results = JSON.parse(stdout);

    const totalTests = results.numTotalTests;
    const totalPassed = results.numPassedTests;

    const coverageFilePath = path.resolve(__dirname, "..", "coverage", "coverage-summary.json");
    const coverageSummaryFile = await fs.readFile(coverageFilePath, "utf-8");
    const coverage = JSON.parse(coverageSummaryFile);
    const lineCoverage = parseInt(coverage.total.lines.pct);

    console.log(`Total: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Coverage: ${lineCoverage}%`);
    console.log(`${totalPassed}/${totalTests} test cases passed. ${lineCoverage}% line coverage achieved.`);
  } catch (error) {
    console.error(`Error running tests: ${(error as Error).message}`);
    throw error;
  }
}

async function processURLFile(file: string): Promise<void> {
  try {
    const data = await fs.readFile(file, "utf8");
    const urls = data
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url !== "");
    for (const url of urls) {
      try {
        logger.info("*".repeat(80));
        logger.info(`Processing URL: ${url}`);
        const result = JSON.stringify(await calculateMetrics(url));
        console.log(result);
        logger.info("Result:", result);
        logger.info("*".repeat(80));
      } catch (error) {
        console.error(`Error processing URL ${url}:`, error);
      }
    }
  } catch (error) {
    console.error("Error reading file:", error);
  }
}

if (process.argv[1] === __filename) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage:");
    console.log("  test               Run tests");
    console.log("  <file>             Process a URL file");
    console.log("  --url <url>        Process a single URL");
    process.exit(1);
  }

  if (args[0] === "test") {
    try {
      await runTests();
    } catch (error) {
      console.error("Error running tests:", error);
      process.exit(1);
    }
  } else if (args[0] === "--url") {
    if (args.length !== 2) {
      console.error("Usage: --url <url>");
      process.exit(1);
    }
    const url = args[1];
    try {
      const result = JSON.stringify(await calculateMetrics(url));
      console.log(result);
    } catch (error) {
      console.error(`Error processing URL ${url}:`, error);
    }
  } else {
    processURLFile(args[0]);
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    const url = body?.url;
    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing URL. Please provide a valid URL to process."
        })
      };
    }

    const result = await calculateMetrics(url);
    logger.info("Result:", result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "URL processed successfully",
        result
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: `Error processing URL: ${(error as Error).message}`
      })
    };
  }
};
