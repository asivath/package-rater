/**
 * This script reads package URLs from a file and calls the API to upload them.
 * It uses the fetch API to make POST requests to the API.
 */
import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import ora from "ora";
import chalk from "chalk";

const LOCAL_API_URL = "http://localhost:3000/package";
const EC2_API_URL = "http://ec2-18-189-102-87.us-east-2.compute.amazonaws.com:3000/package";

function parsePackageUrlsFromFile(filePath: string): string[] {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const packageUrls: string[] = [];

  const urlRegex = /^\d+\.\s\[[^\]]+\]\((https:\/\/[^\)]+)\)/gm;
  let match;

  while ((match = urlRegex.exec(fileContent)) !== null) {
    if (match[1]) {
      packageUrls.push(match[1]);
    }
  }

  return packageUrls;
}
/**
 * Calls the API for each package URL in the list
 * @param packageUrls The list of package URLs to process
 * @param concurrency The number of concurrent requests to make
 * @returns A list of failures
 */
async function callApiForPackages(packageUrls: string[], concurrency = 10) {
  const limit = pLimit(concurrency);
  const failures: { url: string; error: string }[] = [];

  const spinner = ora(chalk.blue("Processing packages...")).start();

  const tasks = packageUrls.map((packageUrl, index) =>
    limit(async () => {
      try {
        const response = await fetch(LOCAL_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ URL: packageUrl, debloat: false }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        spinner.text = chalk.green(`(${index + 1}/${packageUrls.length}) Success: ${packageUrl}`);
      } catch (error) {
        spinner.text = chalk.red(`(${index + 1}/${packageUrls.length}) Error: ${packageUrl}`);
        failures.push({ url: packageUrl, error: (error as Error).message });
      }
    })
  );

  await Promise.all(tasks);
  spinner.stop();

  if (failures.length > 0) {
    console.log(chalk.red("\nFailures:"));
    failures.forEach(({ url, error }) => {
      console.log(chalk.yellow(`- ${url}`), chalk.redBright(`Error: ${error}`));
    });
  } else {
    console.log(chalk.green("\nAll packages processed successfully!"));
  }
}
/**
 * Main function that reads the file and processes the packages
 */
async function main() {
  const filePath = path.resolve("./dependencies.txt");
  const spinner = ora(chalk.blue("Reading package URLs from file...")).start();

  try {
    const packageUrls = parsePackageUrlsFromFile(filePath).slice(0, 50);
    spinner.succeed(chalk.green(`Found ${packageUrls.length} package URLs.`));
    console.log(chalk.blue(`Calling API for ${packageUrls.length} packages...\n`));

    await callApiForPackages(packageUrls);
  } catch (error) {
    spinner.fail(chalk.red("Failed to read or process packages."));
    console.error(chalk.redBright("Unexpected error:"), error);
  }
}

main().catch((error) =>
  console.error(chalk.redBright("Unexpected error during execution:"), error)
);
