import fs from "fs";
import path from "path";

const API_URL = "http://ec2-18-189-102-87.us-east-2.compute.amazonaws.com:3000/package";

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
  for (const packageUrl of packageUrls) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ URL: packageUrl, debloat: false }),
      });

      console.log("response", response);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      console.log(`Success for ${packageUrl}:`, responseData);
    } catch (error) {
      console.error(`Error for ${packageUrl}:`, error);
    }
  }
}

async function main() {
  const filePath = path.resolve("./dependencies.txt");
  const packageUrls = parsePackageUrlsFromFile(filePath);

  console.log(`Found ${packageUrls.length} package URLs. Calling API for each...`);
  await callApiForPackages(packageUrls);
}

main().catch((error) => console.error("Unexpected error:", error));
