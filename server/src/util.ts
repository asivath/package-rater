import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFile, mkdir, writeFile, rm, cp, readdir, stat, access } from "fs/promises";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { assertIsNdjson, getLogger, Ndjson } from "@package-rater/shared";
import { create, extract } from "tar";
import { pipeline } from "stream/promises";
import { assertIsMetadata, Metadata } from "./types.js";
import { createHash } from "crypto";
import getFolderSize from "get-folder-size";
import esbuild from "esbuild";
import path from "path";
import "dotenv/config";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packagesDirPath = path.join(__dirname, "..", "packages");
export const metadataPath = path.join(packagesDirPath, "metadata.json");
try {
  await access(metadataPath);
} catch {
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, JSON.stringify({ byId: {}, byName: {}, costCache: {} }, null, 2));
}

async function loadMetadata(): Promise<Metadata> {
  const metadata = JSON.parse(await readFile(metadataPath, "utf-8"));
  assertIsMetadata(metadata);
  return metadata;
}
const metadata = await loadMetadata(); // Do not directly modify this variable outside of this file

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.AWS_BUCKET_NAME;

/**
 * Moves a package to the packages directory and saves its metadata
 * @param packageName The name of the package
 * @param version The version of the package
 * @param id The ID of the package
 * @param debloat Whether to debloat the package
 * @param packageFilePath The path to the package file (provide either packageFilePath or url)
 * @param url The URL of the package (provide either packageFilePath or url)
 * @returns Whether the package was saved successfully
 */
export const savePackage = async (
  packageName: string,
  version: string,
  id: string,
  debloat: boolean,
  packageFilePath?: string,
  url?: string
): Promise<{ success: boolean; reason?: string }> => {
  if (!packageFilePath && !url) {
    return { success: false, reason: "No package file path or URL provided" };
  }
  if (packageFilePath && url) {
    return { success: false, reason: "Provide either package file path or URL, not both" };
  }
  // Path where packages of the same name are stored e.g. packages/react
  const packageNamePath = path.join(packagesDirPath, packageName);
  // Inside the package name directory, each package (different version of the same package) has its own directory with the ID as the name e.g. packages/react/1234567890abcdef
  const packageIdPath = path.join(packageNamePath, id);
  try {
    await mkdir(packageIdPath, { recursive: true });

    let ndjson = null;
    let dependencies: { [dependency: string]: string } = {};
    let standaloneCost: number = 0;
    if (packageFilePath) {
      // File path where the package will copied to, folder called the package name inside the package ID directory e.g. packages/react/1234567890abcdef/react
      // We don't copy the package to the package ID directory directly because we need to eventually tar the entire directory then delete
      const targetUploadFilePath = path.join(packageIdPath, packageName);
      await cp(packageFilePath, targetUploadFilePath, { recursive: true });

      if (debloat) {
        await minifyProject(packageIdPath);
        logger.info(`Finished debloating package ${packageName} v${version}`);
      }

      const packageJsonPath = path.join(targetUploadFilePath, "package.json");
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
      dependencies = packageJson.dependencies || {};
      standaloneCost = await getFolderSize.loose(targetUploadFilePath) / 1024 / 1024;

      const tarGzFilePath = path.join(packageIdPath, `${packageName}.tgz`);
      await create({ gzip: true, file: tarGzFilePath, cwd: packageIdPath }, ["."]);
      await rm(targetUploadFilePath, { recursive: true });

      if (process.env.NODE_ENV === "prod") {
        await uploadToS3(packageName, id, tarGzFilePath);
        await rm(packageNamePath, { recursive: true });
      }
    } else {
      if (process.env.NODE_ENV === "prod") {
        if (!process.env.CLI_API_URL) {
          return { success: false, reason: "CLI API URL not provided" };
        }
        const response = await fetch(process.env.CLI_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        ndjson = (await response.json()).result;
        assertIsNdjson(ndjson);
      } else {
        const execAsync = promisify(exec);
        const { stdout, stderr } = await execAsync(`./run --url ${url}`, {
          cwd: path.join(__dirname, "..", "..", "cli")
        });
        if (stderr) {
          return { success: false, reason: stderr };
        }
        ndjson = JSON.parse(stdout);
        assertIsNdjson(ndjson);
      }
      const score = ndjson.NetScore;
      if (isNaN(score) || score < 0.5) {
        return { success: false, reason: "Package score is too low" };
      }

      const npmTarURL = `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`;
      const tarResponse = await fetch(npmTarURL);
      if (!tarResponse.ok || !tarResponse.body) {
        return { success: false, reason: "Failed to fetch package" };
      }

      const tarballPath = path.join(packageIdPath, `${packageName}.tgz`);
      const tarballStream = createWriteStream(tarballPath);
      await pipeline(tarResponse.body, tarballStream);

      await extract({ file: tarballPath, cwd: packageIdPath });
      const extractPath = path.join(packageIdPath, "package");

      if (debloat) {
        await minifyProject(extractPath);
        logger.info(`Finished debloating package ${packageName} v${version}`);
        await create({ gzip: true, file: tarballPath, cwd: extractPath }, ["."]);
      }

      const packageJsonPath = path.join(extractPath, "package.json");
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
      dependencies = packageJson.dependencies || {};
      standaloneCost = await getFolderSize.loose(extractPath) / 1024 / 1024;

      await rm(extractPath, { recursive: true });

      if (process.env.NODE_ENV === "prod") {
        await uploadToS3(packageName, id, tarballPath);
        await rm(packageNamePath, { recursive: true });
      }
    }

    await updatePackageMetadata(id, packageName, version, ndjson, dependencies, standaloneCost, 0, "pending");
    logger.info(`Saved package ${packageName} v${version} with ID ${id} and standalone cost ${standaloneCost.toFixed(2)} MB`);
    return { success: true };
  } catch (error) {
    await rm(packageIdPath, { recursive: true });
    return { success: false, reason: (error as Error).message };
  }
};

/**
 * Adds package metadata to the metadata file
 * @param id The package ID
 * @param packageName The package name
 * @param version The package version
 * @param ndjson The ndjson of the package
 */
export const updatePackageMetadata = async (
  id: string,
  packageName: string,
  version: string,
  ndjson: Ndjson | null,
  dependencies: { [dependency: string]: string },
  standaloneCost: number,
  totalCost: number,
  costStatus: "pending" | "completed" | "failed"
) => {
  metadata.byId[id] = { packageName, version, ndjson, dependencies, standaloneCost, totalCost, costStatus };
  if (!metadata.byName[packageName]) {
    metadata.byName[packageName] = {};
  }
  metadata.byName[packageName][version] = { id, ndjson, dependencies, standaloneCost, totalCost, costStatus };
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
};

/**
 * Checks if the package exists
 * @param id The package ID
 * @returns Whether the package exists
 */
export const checkIfPackageExists = (id: string) => {
  return metadata.byId[id] ? true : false;
};

export const getPackageMetadata = (id: string) => {
  return metadata.byId[id];
};

/**
 * Uploads a package to the S3 bucket
 * @param packageName The name of the package
 * @param id The ID of the package
 * @param tarGzFilePath The path to the .tgz file to upload
 */
const uploadToS3 = async (packageName: string, id: string, tarGzFilePath: string) => {
  try {
    const tarballBuffer = await readFile(tarGzFilePath);
    const s3Key = `${packageName}/${id}/${path.basename(tarGzFilePath)}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: tarballBuffer
    });

    await s3Client.send(command);
    logger.info(`Uploaded package ${packageName} to S3: ${s3Key}`);
  } catch (error) {
    logger.error(`Error uploading ${packageName} to S3: ${(error as Error).message}`);
    throw error;
  }
};

/**
 * Minifies a project
 * @param directory The directory of the project
 */
const minifyProject = async (directory: string) => {
  try {
    const files = await readdir(directory);
    for (const file of files) {
      const filePath = path.join(directory, file);
      const stats = await stat(filePath);
      if (stats.isDirectory()) {
        await minifyProject(filePath);
      } else if (file.endsWith(".js") || file.endsWith(".ts")) {
        try {
          await esbuild.build({
            entryPoints: [filePath],
            outfile: filePath,
            minify: true,
            treeShaking: true,
            bundle: false,
            allowOverwrite: true,
            platform: "node",
            logLevel: "silent"
          });
        } catch (error) {
          logger.error(`Error minifying ${filePath}: ${(error as Error).message}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error minifying project in ${directory}: ${(error as Error).message}`);
    throw error;
  }
};

/**
 * Calculates the ID of a package
 * @param packageName The name of the package
 * @param version The version of the package
 * @returns The package ID
 */
export function calculatePackageId(packageName: string, version: string): string {
  const hash = createHash("sha256")
    .update(packageName + version)
    .digest("hex");
  return BigInt("0x" + hash)
    .toString()
    .slice(0, 16);
}

// export async function calculateTotalPackageCost(id: string): Promise<number> {
//   const packageData = getPackageMetadata(id);
//   if (!packageData) {
//     return 0;
//   }
//   let totalCost = packageData.standaloneCost;

//   async function calculateCost(packageName: string, version: string): Promise<number | undefined> {
//     const id = calculatePackageId(packageName, version);
//     if (metadata.costCache[id]) {
//       return metadata.costCache[id].cost;
//     }

//     const npmTarURL = `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`;
//     const tarResponse = await fetch(npmTarURL);
//     if (!tarResponse.ok || !tarResponse.body) {
//       logger.error(`Failed to fetch package ${packageName} v${version}`);
//       return;
//     }

//     const tarballPath = path.join(packagesDirPath, packageName, id, `${packageName}.tgz`);
//     const tarballStream = createWriteStream(tarballPath);
//     await pipeline(tarResponse.body, tarballStream);
//   }

//   for (const dependency in packageData.dependencies) {
//     const version = packageData.dependencies[dependency];
//     const dependencyId = calculatePackageId(dependency, version);
//     totalCost += await calculateCost(dependencyId);
//   }
//   return totalCost;
// }
