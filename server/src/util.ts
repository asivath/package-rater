import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFile, mkdir, writeFile, rm, cp, readdir, stat, access } from "fs/promises";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { assertIsNdjson, getLogger } from "@package-rater/shared";
import { create, extract } from "tar";
import { pipeline } from "stream/promises";
import { assertIsMetadata, Metadata } from "./types.js";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { minVersion, inc, satisfies, parse } from "semver";
import getFolderSize from "get-folder-size";
import esbuild from "esbuild";
import path from "path";
import TaskQueue from "./taskQueue.js";
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

const taskQueue = new TaskQueue();

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
      standaloneCost = (await getFolderSize.loose(targetUploadFilePath)) / 1024 / 1024;

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
      standaloneCost = (await getFolderSize.loose(extractPath)) / 1024 / 1024;

      await rm(extractPath, { recursive: true });

      if (process.env.NODE_ENV === "prod") {
        await uploadToS3(packageName, id, tarballPath);
        await rm(packageNamePath, { recursive: true });
      }
    }

    metadata.byId[id] = {
      packageName,
      version,
      ndjson,
      dependencies,
      standaloneCost,
      totalCost: 0,
      costStatus: "pending"
    };
    if (!metadata.byName[packageName]) {
      metadata.byName[packageName] = {};
    }
    metadata.byName[packageName][version] = {
      id,
      ndjson,
      dependencies,
      standaloneCost,
      totalCost: 0,
      costStatus: "pending"
    };
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    logger.info(
      `Saved package ${packageName} v${version} with ID ${id} and standalone cost ${standaloneCost.toFixed(2)} MB`
    );

    // Do not await this promise to allow calculation to happen in the background
    calculateTotalPackageCost(id)
      .then((cost) => {
        if (cost === 0) {
          logger.error(`Failed to calculate total cost of package ${packageName} v${version}`);
          return;
        }
        logger.info(`Calculated total cost of package ${packageName} v${version}: ${cost.toFixed(2)} MB`);
      })
      .catch((error) => {
        logger.error(
          `Failed to calculate total cost of package ${packageName} v${version}: ${(error as Error).message}`
        );
      });
    return { success: true };
  } catch (error) {
    await rm(packageIdPath, { recursive: true });
    return { success: false, reason: (error as Error).message };
  }
};

/**
 * Fetches the exact minimum available version of a package
 * @param packageName The name of the package
 * @param versionRange The version range of the package
 * @returns
 */
export async function getExactAvailableVersion(packageName: string, versionRange: string): Promise<string | null> {
  const minResolvedVersion = minVersion(versionRange);
  if (!minResolvedVersion) return null;

  try {
    let currentVersion = minResolvedVersion;
    while (satisfies(currentVersion, versionRange)) {
      const npmUrl = `https://registry.npmjs.org/${packageName}/${currentVersion}`;
      const response = await fetch(npmUrl);
      if (response.ok) {
        return currentVersion.version;
      }
      const nextVersionStr = inc(currentVersion, "patch");
      if (!nextVersionStr) break;
      const nextVersion = parse(nextVersionStr);
      if (!nextVersion) break;
      currentVersion = nextVersion;
    }
  } catch (error) {
    logger.error(
      `Failed to fetch exact available version of ${packageName} with version range ${versionRange}: ${(error as Error).message}`
    );
  }

  return null;
}

/**
 * Calculates the total cost of a package
 * @param id The ID of the package
 * @returns The total cost of the package
 */
export async function calculateTotalPackageCost(id: string): Promise<number> {
  const packageDataById = metadata.byId[id];

  if (!packageDataById) {
    throw new Error(`Package ${id} does not exist`);
  }

  const packageDataByName = metadata.byName[packageDataById.packageName];

  if (packageDataById.costStatus === "completed") {
    return packageDataById.totalCost;
  }

  if (packageDataById.costStatus === "initiated") {
    return await taskQueue.awaitTask(id);
  }

  async function calculateCost(packageName: string, version: string): Promise<number> {
    const id = calculatePackageId(packageName, version);
    const packateMetadata = metadata.byId[id];
    if (packateMetadata) {
      if (packateMetadata.costStatus === "completed") {
        return packateMetadata.totalCost;
      } else if (packateMetadata.costStatus === "initiated") {
        return await taskQueue.awaitTask(id);
      }
    }
    const packageCache = metadata.costCache[id];
    if (packageCache) {
      if (packageCache.costStatus === "completed") {
        return packageCache.cost;
      } else if (packageCache.costStatus === "initiated") {
        return await taskQueue.awaitTask(id);
      }
    }
    metadata.costCache[id] = { cost: 0, costStatus: "initiated" };

    const exactVersion = await getExactAvailableVersion(packageName, version);
    if (!exactVersion) {
      throw new Error(`Invalid version ${version}`);
    }

    const taskFn = async () => {
      const npmTarURL = `https://registry.npmjs.org/${packageName}/-/${packageName}-${exactVersion}.tgz`;
      const tarResponse = await fetch(npmTarURL);
      if (!tarResponse.ok || !tarResponse.body) {
        logger.error(`Failed to fetch package ${packageName} with version ${exactVersion}`);
        return 0;
      }

      const tmpDir = path.join(tmpdir(), `${packageName}-${exactVersion}`);
      await mkdir(tmpDir, { recursive: true });
      const tarballPath = path.join(tmpDir, `${packageName}.tgz`);
      const tarballStream = createWriteStream(tarballPath);
      await pipeline(tarResponse.body, tarballStream);

      await extract({ file: tarballPath, cwd: tmpDir });
      const extractPath = path.join(tmpDir, "package");
      const packageJsonPath = path.join(extractPath, "package.json");
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
      const dependencies = packageJson.dependencies || {};

      let cost = (await getFolderSize.loose(extractPath)) / 1024 / 1024;
      await rm(tmpDir, { recursive: true });

      for (const dependency in dependencies) {
        const depVersion = dependencies[dependency];
        cost += await calculateCost(dependency, depVersion);
      }

      return cost;
    };
    try {
      const result = await taskQueue.addTask(id, taskFn);
      metadata.costCache[id].cost = result;
      metadata.costCache[id].costStatus = "completed";
      return result;
    } catch (error) {
      metadata.costCache[id].costStatus = "failed";
      logger.error(
        `Failed to calculate cost of package ${packageName} with version ${version}: ${(error as Error).message}`
      );
      return 0;
    }
  }
  return taskQueue
    .addTask(id, async () => {
      let totalCost = packageDataById.standaloneCost;
      packageDataById.costStatus = "initiated";
      packageDataByName[packageDataById.version].costStatus = "initiated";

      for (const dependency in packageDataById.dependencies) {
        const version = packageDataById.dependencies[dependency];
        totalCost += await calculateCost(dependency, version);
      }

      packageDataById.totalCost = totalCost;
      packageDataById.costStatus = "completed";
      packageDataByName[packageDataById.version].totalCost = totalCost;
      packageDataByName[packageDataById.version].costStatus = "completed";
      return totalCost;
    })
    .catch((error) => {
      packageDataById.costStatus = "failed";
      packageDataByName[packageDataById.version].costStatus = "failed";
      logger.error(
        `Failed to calculate total cost of package ${packageDataById.packageName} with version ${packageDataById.version}: ${(error as Error).message}`
      );
      throw error;
    })
    .finally(async () => {
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2)).catch((error) => {
        logger.error(`Failed to save metadata: ${(error as Error).message}`);
      });
    });
}

/**
 * Checks if the package exists
 * @param id The package ID
 * @returns Whether the package exists
 */
export const checkIfPackageExists = (id: string) => {
  return metadata.byId[id] ? true : false;
};

/**
 * Gets the metadata object
 * @returns The metadata object
 */
export const getMetadata = () => {
  return metadata;
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
