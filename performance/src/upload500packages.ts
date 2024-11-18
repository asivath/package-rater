import fs from "fs";
import path from "path";

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

async function callApiForPackages(packageUrls: string[]) {
  const failures: { url: string; error: string }[] = []; // Collect failures

  for (const packageUrl of packageUrls) {
    try {
      const response = await fetch(LOCAL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ URL: packageUrl, debloat: false }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      console.log(`Success for ${packageUrl}:`, responseData);
    } catch (error) {
      console.error(`Error for ${packageUrl}:`, error);
      failures.push({ url: packageUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach(({ url, error }) => {
      console.log(`- ${url}: ${error}`);
    });
  }
}

async function main() {
  const filePath = path.resolve("./dependencies.txt");
  const packageUrls = parsePackageUrlsFromFile(filePath).slice(0, 500);

  console.log(`Found ${packageUrls.length} package URLs. Calling API for each...`);
  await callApiForPackages(packageUrls);
}

main().catch((error) => console.error("Unexpected error:", error));
