import fs from "fs/promises";
import calculateMetrics from "../metrics/Netscore.js";
import { getLogger } from "@package-rater/shared";

const logger = getLogger("cli");

export class URLFileCommand {
  public static async run(file: string): Promise<void> {
    await processURLFile(file);
  }
}

export async function processURLFile(file: string): Promise<void> {
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