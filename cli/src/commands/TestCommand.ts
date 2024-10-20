import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { getLogger } from "@package-rater/shared";

const logger = getLogger("cli");

export class TestCommand {
  public static run(): void {
    this.runTests((testError) => {
      if (testError) {
        console.error("Error running tests:", testError);
        process.exit(1);
      } else {
        process.exit(0);
      }
    });
  }

  private static async runTests(callback: (error: string | null) => void): Promise<void> {
    try {
      const testProcess = spawn("yarn", ["test:coverage"]);

      testProcess.on("close", async (code) => {
        console.log("run tests");

        if (code !== 0) {
          return callback(`Test process exited with code ${code}`);
        }
        // Read the test results from the file
        const file = await fs.readFile(
          path.resolve(
            __dirname,
            "..",
            process.env.NODE_ENV === "test" ? "logCoverage" : "logCoverage1",
            "test-results.json"
          ),
          "utf-8"
        );
        const results = JSON.parse(file);
        const totalTests = results.numTotalTests;
        const totalPassed = results.numPassedTests;

        const coverageSummary = await fs.readFile(
          path.resolve(
            __dirname,
            "..",
            process.env.NODE_ENV === "test" ? "logCoverage" : "logCoverage1",
            "coverage-summary.json"
          ),
          "utf-8"
        );
        const coverage = JSON.parse(coverageSummary);
        const lineCoverage = parseInt(coverage.total.lines.pct);

        logger.info(`Total: ${totalTests}`);
        logger.info(`Passed: ${totalPassed}`);
        logger.info(`Coverage: ${lineCoverage}%`);
        logger.info(`${totalPassed}/${totalTests} test cases passed. ${lineCoverage}% line coverage achieved.`);
        console.log(`Total: ${totalTests}`);
        console.log(`Passed: ${totalPassed}`);
        console.log(`Coverage: ${lineCoverage}%`);
        console.log(`${totalPassed}/${totalTests} test cases passed. ${lineCoverage}% line coverage achieved.`);
      });
    } catch (error) {
      callback((error as Error).message);
    }
  }
}
