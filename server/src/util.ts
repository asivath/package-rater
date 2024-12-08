/**
 * Utility functions for the server
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFile, mkdir, writeFile, rm, access, readdir, stat, rmdir } from "fs/promises";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { assertIsNdjson, getLogger, cloneRepo } from "@package-rater/shared";
import { extract } from "tar";
import { pipeline } from "stream/promises";
import { assertIsMetadata, Metadata } from "./types.js";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { satisfies } from "semver";
import esbuild from "esbuild";
import path from "path";
import AdmZip from "adm-zip";
import "dotenv/config";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packagesDirPath = path.join(__dirname, "..", "packages");
const metadataPath = path.join(packagesDirPath, "metadata.json");
let metadata: Metadata;
/**
 * loads the metadata from the metadata file
 */
async function loadMetadata(): Promise<void> {
  const metadataFile = JSON.parse(await readFile(metadataPath, "utf-8"));
  assertIsMetadata(metadataFile);
  metadata = metadataFile;
}
if (process.env.NODE_TEST != "true") {
  try {
    await access(metadataPath);
  } catch {
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, JSON.stringify({ byId: {}, byName: {}, costCache: {} }));
  }
  await loadMetadata();
}

const packageCostPromisesMap = new Map<string, Promise<number>>();

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.AWS_BUCKET_NAME;

/**
 * Moves a package to the packages directory and saves its metadata
 * @param packageName The name of the package
 * @param version The version of the package
 * @param id The ID of the package
 * @param debloat Whether to debloat the package
 * @param zip The AdmZip object of the package (provide either zip or url)
 * @param url The URL of the package (provide either zip or url)
 * @returns Whether the package was saved successfully
 */
export const savePackage = async (
  packageName: string,
  version: string,
  id: string,
  debloat: boolean,
  zip?: AdmZip,
  url?: string
): Promise<{ success: boolean; reason?: string }> => {
  if (!zip && !url) {
    return { success: false, reason: "No package file path or URL provided" };
  }
  if (zip && url) {
    return { success: false, reason: "Provide either package file path or URL, not both" };
  }
  const escapedPackageName = packageName.replace("/", "_");
  // Path where packages of the same name are stored e.g. packages/react
  const packageNamePath = path.join(packagesDirPath, escapedPackageName);
  // Inside the package name directory, each package (different version of the same package) has its own directory with the ID as the name e.g. packages/react/1234567890abcdef
  const packageIdPath = path.join(packageNamePath, id);
  const zipPath = path.join(packageIdPath, `${escapedPackageName}.zip`);
  const cleanupFiles = async () => {
    await rm(packageIdPath, { recursive: true });
    if ((await readdir(packageNamePath)).length === 0) {
      await rmdir(packageNamePath);
    }
  };
  try {
    await mkdir(packageIdPath, { recursive: true });

    let dependencies: { [dependency: string]: string } = {};
    let standaloneCost: number = 0;
    let ndjson;
    let packageJson;
    let readmeString: string | undefined;
    let finalZip: AdmZip;

    if (zip) {
      const packageJsonEntry = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory && entry.entryName.endsWith("package.json"))
        .sort((a, b) => a.entryName.split("/").length - b.entryName.split("/").length)[0];
      // Already checked earlier that package.json exists
      packageJson = JSON.parse(packageJsonEntry!.getData().toString()) as {
        repository: { url: string };
        dependencies: { [key: string]: string };
      };

      if (!packageJson.repository) {
        await cleanupFiles();
        return { success: false, reason: "No repository present in package.json" };
      }
      if (typeof packageJson.repository === "string") {
        url = `https://github.com/${packageJson.repository}`;
      } else if (packageJson.repository?.url) {
        url = packageJson.repository.url;
      } else {
        await cleanupFiles();
        return { success: false, reason: "Invalid repository information" };
      }
      url = url.replace(/^git\+/, "");
      url = url.replace(/^git:\/\//, "https://");

      try {
        const zipEntries = zip.getEntries();
        const readmeRegex = /^readme/i;
        for (const entry of zipEntries) {
          if (!entry.isDirectory && readmeRegex.test(entry.entryName.split("/").pop() || "")) {
            readmeString = entry.getData().toString("utf-8");
            logger.info(`Found README in zip at ${entry.entryName} for package ${packageName} v${version}`);
            break;
          }
        }
        if (!readmeString) {
          logger.warn(`No README found for package ${packageName} v${version}`);
        }
      } catch (error) {
        logger.error(`Error processing zip file for package ${packageName} v${version}: ${(error as Error).message}`);
      }
      finalZip = zip;
    } else {
      // Given a url
      const unscopedName = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
      const npmTarURL = `https://registry.npmjs.org/${packageName}/-/${unscopedName}-${version}.tgz`;
      const tarResponse = await fetch(npmTarURL);
      if (!tarResponse.ok || !tarResponse.body) {
        await cleanupFiles();
        return { success: false, reason: "Failed to fetch package" };
      }
      const tarBallPath = path.join(packageIdPath, `${escapedPackageName}.tgz`);
      const tarballStream = createWriteStream(tarBallPath);
      await pipeline(tarResponse.body, tarballStream);

      await extract({ file: tarBallPath, cwd: packageIdPath });
      const extractedContents = await readdir(packageIdPath);
      const topLevelDirs = await Promise.all(
        extractedContents.map(async (content) => {
          const contentPath = path.join(packageIdPath, content);
          const stats = await stat(contentPath);
          return stats.isDirectory() && path.extname(contentPath) !== ".tgz" ? content : null;
        })
      );
      const validDirs = topLevelDirs.filter((dir) => dir !== null);
      const extractPath = path.join(packageIdPath, validDirs[0]);

      const packageJsonPath = path.join(extractPath, "package.json");
      packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

      try {
        const files = await readdir(extractPath);
        const readmeRegex = /^readme/i;
        for (const file of files) {
          if (readmeRegex.test(file)) {
            const readmeFilePath = path.join(extractPath, file);
            readmeString = await readFile(readmeFilePath, "utf-8");
            logger.info(`Found README at ${readmeFilePath} for package ${packageName} v${version}`);
            break;
          }
        }
        if (!readmeString) {
          logger.warn(`No README found for package ${packageName} v${version}`);
        }
      } catch (error) {
        logger.error(`Error reading files in directory ${extractPath}: ${(error as Error).message}`);
      }

      finalZip = new AdmZip();
      finalZip.addLocalFolder(extractPath, undefined, (filename) => {
        return !filename.endsWith(".tgz");
      });

      await rm(extractPath, { recursive: true });
      await rm(tarBallPath);
    }
    if (process.env.NODE_ENV === "production") {
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
      await cleanupFiles();
      return { success: false, reason: "Package score is too low" };
    }

    if (debloat) {
      const tempDebloatDir = path.join(tmpdir(), id);
      await mkdir(tempDebloatDir, { recursive: true });
      finalZip.extractAllTo(tempDebloatDir, true);
      await minifyProject(tempDebloatDir);
      logger.info(`Finished debloating package ${packageName} v${version}`);
      finalZip = new AdmZip();
      finalZip.addLocalFolder(tempDebloatDir);
      await rm(tempDebloatDir, { recursive: true });
    }

    finalZip.writeZip(zipPath);

    dependencies = packageJson.dependencies || {};
    standaloneCost = (await stat(zipPath)).size / (1024 * 1024);

    //Add info based on ID
    metadata.byId[id] = {
      packageName,
      version,
      ndjson,
      dependencies,
      standaloneCost,
      totalCost: 0,
      costStatus: "pending"
    };

    //Initialize new package with empty versions and whether it was uploaded with content or URL
    if (!metadata.byName[packageName]) {
      metadata.byName[packageName] = {
        uploadedWithContent: zip ? true : false,
        versions: {}
      };
    }

    //Add info based on name
    metadata.byName[packageName].versions[version] = {
      id,
      ndjson,
      dependencies,
      standaloneCost,
      totalCost: 0,
      costStatus: "pending",
      readme: readmeString
    };

    await writeFile(metadataPath, JSON.stringify(metadata));
    logger.info(
      `Saved package ${packageName} v${version} with ID ${id} and standalone cost ${standaloneCost.toFixed(2)} MB`
    );

    if (process.env.NODE_ENV === "production") {
      await uploadToS3(escapedPackageName, id, zipPath);
      await cleanupFiles();
    }

    // Do not await this promise to allow calculation to happen in the background
    calculateTotalPackageCost(packageName, version)
      .then((cost) => {
        if (cost === 0) {
          logger.error(`Failed to calculate total cost of package ${packageName} v${version}`);
          metadata.byId[id].costStatus = "failed";
          return;
        }
        logger.info(`Calculated total cost of package ${packageName} v${version}: ${cost.toFixed(2)} MB`);
      })
      .catch((error) => {
        logger.error(
          `Failed to calculate total cost of package ${packageName} v${version}: ${(error as Error).message}`
        );
        metadata.byId[id].costStatus = "failed";
      });
    return { success: true };
  } catch (error) {
    await cleanupFiles();
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
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}`);
    if (!response.ok) {
      logger.error(`Failed to fetch metadata for ${packageName}`);
      return null;
    }

    const data = await response.json();
    const availableVersions = Object.keys(data.versions);

    // Find the first version that satisfies the range
    const satisfyingVersion = availableVersions.find((version) => satisfies(version, versionRange));
    return satisfyingVersion || null;
  } catch (error) {
    logger.error(`Failed to fetch exact available version for ${packageName}: ${(error as Error).message}`);
    return null;
  }
}

type PackageNode = {
  id: string;
  packageName: string;
  version: string;
  standaloneCost: number;
  totalCost: number;
  dependencies: string[]; // List of package IDs
};
/**
 * Builds a dependency graph for a package
 * @param packageName
 * @param version
 * @returns The dependency graph
 */
async function buildDependencyGraph(packageName: string, version: string): Promise<Map<string, PackageNode>> {
  const graph = new Map<string, PackageNode>();
  const stack = [{ packageName, version }];

  while (stack.length > 0) {
    const { packageName, version } = stack.pop()!;
    const id = calculatePackageId(packageName, version);
    if (graph.has(id)) continue;

    if (metadata.costCache[id]) {
      const node: PackageNode = {
        id,
        packageName,
        version,
        standaloneCost: metadata.costCache[id].standaloneCost,
        totalCost: metadata.costCache[id].totalCost,
        dependencies: [] // Not filled in since totalCost is already calculated
      };
      graph.set(id, node);
      continue;
    }
    if (metadata.byId[id]) {
      const dependencies = Object.entries(metadata.byId[id].dependencies).map(([depName, depVersion]) =>
        calculatePackageId(depName, depVersion)
      );
      const node: PackageNode = {
        id,
        packageName,
        version,
        standaloneCost: metadata.byId[id].standaloneCost,
        totalCost: metadata.byId[id].totalCost,
        dependencies: dependencies // Filled in because this could be the root package, so if we don't fill in we won't consider any dependencies, should be fine since dependencies will be cached
      };
      for (const dependency of Object.entries(metadata.byId[id].dependencies)) {
        stack.push({ packageName: dependency[0], version: dependency[1] });
      }
      metadata.costCache[id] = {
        standaloneCost: metadata.byId[id].standaloneCost,
        totalCost: metadata.byId[id].totalCost,
        dependencies: dependencies
      };
      graph.set(id, node);
      continue;
    }

    const failedNode: PackageNode = {
      id,
      packageName,
      version,
      standaloneCost: 0,
      totalCost: 0,
      dependencies: []
    };
    const failedCache = {
      standaloneCost: 0,
      totalCost: 0,
      dependencies: []
    };
    const exactVersion = await getExactAvailableVersion(packageName, version);
    if (!exactVersion) {
      logger.error(`Invalid version ${version}`);
      graph.set(id, failedNode);
      metadata.costCache[id] = failedCache;
      continue;
    }
    try {
      const unscopedName = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
      const npmTarURL = `https://registry.npmjs.org/${packageName}/-/${unscopedName}-${exactVersion}.tgz`;
      const tarResponse = await fetch(npmTarURL);
      if (!tarResponse.ok || !tarResponse.body) {
        logger.error(`Failed to fetch package ${packageName} with version ${exactVersion}`);
        graph.set(id, failedNode);
        metadata.costCache[id] = {
          standaloneCost: 0,
          totalCost: 0,
          dependencies: []
        };
        continue;
      }

      const escapedPackageName = packageName.replace("/", "_");
      const tmpDir = path.join(tmpdir(), `${escapedPackageName}-${exactVersion}`);
      await mkdir(tmpDir, { recursive: true });
      const tarBallPath = path.join(tmpDir, `${escapedPackageName}.tgz`);
      const tarballStream = createWriteStream(tarBallPath);
      await pipeline(tarResponse.body, tarballStream);

      await extract({ file: tarBallPath, cwd: tmpDir });
      const extractedContents = await readdir(tmpDir);
      const topLevelDirs = await Promise.all(
        extractedContents.map(async (content) => {
          const contentPath = path.join(tmpDir, content);
          const stats = await stat(contentPath);
          return stats.isDirectory() && path.extname(contentPath) !== ".tgz" ? content : null;
        })
      );
      const validDirs = topLevelDirs.filter((dir) => dir !== null);
      const extractPath = path.join(tmpDir, validDirs[0]);
      const packageJsonPath = path.join(extractPath, "package.json");
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));
      const dependencies = Object.entries(packageJson.dependencies || {}).map(([depName, depVersion]) => {
        const depId = calculatePackageId(depName, depVersion as string);
        stack.push({ packageName: depName, version: depVersion as string });
        return depId;
      });

      const node: PackageNode = {
        id,
        packageName,
        version,
        standaloneCost: (await stat(tarBallPath)).size / (1024 * 1024),
        totalCost: 0,
        dependencies
      };
      graph.set(id, node);
      metadata.costCache[id] = {
        standaloneCost: node.standaloneCost,
        totalCost: 0,
        dependencies
      };

      await rm(tmpDir, { recursive: true });
    } catch (error) {
      logger.error(
        `Failed to build graph for ${packageName} with version ${exactVersion}: ${(error as Error).message}`
      );
      graph.set(id, failedNode);
      metadata.costCache[id] = failedCache;
      continue;
    }
  }

  return graph;
}

/**
 * Detects cycles in a directed graph using Tarjan's strongly connected components algorithm
 * @param graph The dependency graph
 * @returns An array of strongly connected components (sets of node IDs)
 */
function detectCycles(graph: Map<string, PackageNode>): Set<string>[] {
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const sccs: Set<string>[] = [];
  let index = 0;

  function strongConnect(nodeId: string) {
    indices.set(nodeId, index);
    lowLinks.set(nodeId, index);
    index++;
    stack.push(nodeId);
    onStack.add(nodeId);

    const node = graph.get(nodeId)!;
    for (const depId of node.dependencies) {
      if (!indices.has(depId)) {
        // Recursively visit unvisited dependency
        strongConnect(depId);
        // Update the low-link value of the current node
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, lowLinks.get(depId)!));
      } else if (onStack.has(depId)) {
        // Update the low-link value of the current node for back edge
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, indices.get(depId)!));
      }
    }

    // If nodeId is a root node, pop the stack to create an SCC
    if (lowLinks.get(nodeId) === indices.get(nodeId)) {
      const scc = new Set<string>();
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.add(w);
      } while (w !== nodeId);

      // Only push the SCC if it forms a cycle (more than one node or self-loop)
      if (scc.size > 1 || (scc.size === 1 && node.dependencies.includes(node.id))) {
        sccs.push(scc);
      }
    }
  }

  for (const nodeId of graph.keys()) {
    if (!indices.has(nodeId)) {
      strongConnect(nodeId);
    }
  }

  return sccs;
}

/**
 * Recursively calculates the total cost of a package
 * @param rootName
 * @param rootVersion
 * @param graph The dependency graph
 * @returns The total cost of the package
 */
async function calculateTotalCost(graph: Map<string, PackageNode>): Promise<number> {
  const calculatedCosts = new Map<string, number>();

  const cycles = detectCycles(graph);
  let cyclicTotalCost = 0;
  for (const cycle of cycles) {
    let cycleCost = 0;

    // Calculate the total standalone cost of nodes in the cycle
    for (const nodeId of cycle) {
      const node = graph.get(nodeId);
      if (node) {
        cycleCost += node.standaloneCost;
      }
    }

    // Calculate the average cost for the cycle
    const averageCost = cycleCost / cycle.size;

    // Cache each cyclic node with dependencies and calculated average cost
    for (const nodeId of cycle) {
      const node = graph.get(nodeId);
      if (node) {
        cyclicTotalCost += averageCost;
        metadata.costCache[nodeId] = {
          totalCost: averageCost,
          standaloneCost: node.standaloneCost,
          dependencies: node.dependencies
        };
        graph.delete(nodeId);
        calculatedCosts.set(nodeId, averageCost);
      }
    }
  }

  /**
   * This function performs a depth-first search to calculate the total cost of a node
   * @param nodeId
   * @param visited
   * @returns
   */
  async function dfsCalculateCost(nodeId: string, visited: Set<string> = new Set()): Promise<number> {
    if (visited.has(nodeId)) {
      return 0;
    }
    visited.add(nodeId);
    if (calculatedCosts.has(nodeId)) {
      return calculatedCosts.get(nodeId)!;
    }

    const node = graph.get(nodeId);
    if (!node) {
      throw new Error(`Node with ID ${nodeId} not found in the dependency graph.`);
    }

    let totalCost = node.standaloneCost;
    for (const depId of node.dependencies) {
      totalCost += await dfsCalculateCost(depId);
    }

    calculatedCosts.set(nodeId, totalCost);
    metadata.costCache[nodeId] = {
      totalCost: totalCost,
      standaloneCost: node.standaloneCost,
      dependencies: node.dependencies
    };
    graph.delete(nodeId);

    return totalCost;
  }

  const startingNodes = Array.from(graph.keys());
  let baseTotalCost = 0;
  for (const nodeId of startingNodes) {
    if (!calculatedCosts.has(nodeId)) {
      baseTotalCost += await dfsCalculateCost(nodeId);
    }
  }

  return baseTotalCost + cyclicTotalCost;
}

/**
 * Calculates the total cost of a package
 * @param packageName The name of the package
 * @param version The version of the package
 * @returns The total cost of the package
 * @throws Error if the package does not exist
 * @throws Error if initial task addition fails
 */
export async function calculateTotalPackageCost(packageName: string, version: string): Promise<number> {
  const id = calculatePackageId(packageName, version);
  const packageDataById = metadata.byId[id];
  if (!packageDataById) throw new Error(`Package ${id} does not exist`);
  if (packageDataById.costStatus === "completed") return packageDataById.totalCost;
  if (packageDataById.costStatus === "failed") throw new Error(`Failed to calculate cost of package ${id}`);
  if (packageCostPromisesMap.has(id)) return packageCostPromisesMap.get(id)!;

  const start = Date.now();
  // Calculate the total cost of the package by
  // building a dependency graph and calculating the total
  // cost of each node in the graph
  const calculateCost = async () => {
    const graph = await buildDependencyGraph(packageName, version);
    const totalCost = await calculateTotalCost(graph);
    packageDataById.totalCost = totalCost;
    packageDataById.costStatus = "completed";
    metadata.byName[packageName].versions[version].totalCost = totalCost;
    metadata.byName[packageName].versions[version].costStatus = "completed";

    return totalCost;
  };

  const costPromise = calculateCost();
  packageCostPromisesMap.set(id, costPromise);
  try {
    const cost = await costPromise;
    return cost;
  } catch (error) {
    logger.error(`Failed to calculate total cost of package ${id}: ${(error as Error).message}`);
    packageDataById.costStatus = "failed";
    metadata.byName[packageName].versions[version].costStatus = "failed";
    return 0;
  } finally {
    packageCostPromisesMap.delete(id);
    await writeFile(metadataPath, JSON.stringify(metadata));
    const end = Date.now();
    logger.info(`Calculated total cost of package ${id} in ${((end - start) / 1000).toFixed(2)} seconds`);
  }
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
 * Checks if the given version's patch is not lower than the latest patch (within the same major and minor version)
 * @param availablePackageVersions The available versions of the package
 * @param newVersion The new version to check
 * @returns
 */
export const checkIfContentPatchValid = (availablePackageVersions: string[], newVersion: string) => {
  const [newMajor, newMinor, newPatch] = newVersion.split(".").map(Number);
  for (const curVersion of availablePackageVersions) {
    const [major, minor, patch] = curVersion.split(".").map(Number);
    if (newMajor === major && newMinor === minor) {
      if (newPatch < patch) {
        return false;
      }
    }
  }
  return true;
};

/**
 * Gets the metadata object
 * @returns The metadata object
 */
export const getPackageMetadata = () => {
  return metadata;
};

/**
 * Writes the metadata object to the metadata file
 * @returns write of file
 */
export const writeMetadata = () => {
  return writeFile(metadataPath, JSON.stringify(metadata));
};

/**
 * Clears the metadata in memory and writes an empty metadata object to the metadata file
 * @param id The ID of the package
 */
export const clearMetadata = async () => {
  try {
    await writeFile(metadataPath, JSON.stringify({ byName: {}, byId: {}, costCache: {} }));
  } catch (error) {
    logger.error(`Failed to clear file ${metadataPath}: ${(error as Error).message}`);
  }
  loadMetadata();
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

/**
 * Gets the details of a package from a github URL
 * @param url The URL of the github repository
 * @returns The package name and version
 */
export const getGithubDetails = async (url: string) => {
  let packageName: string | undefined;
  let version: string | undefined;
  const repoDir = await cloneRepo(url, "repo");
  if (repoDir) {
    try {
      // Check if package.json exists in the root directory
      // If it doesn't exist, fall back to the GitHub repo name
      const packageJsonFile = await readFile(`${repoDir}/package.json`);
      const packageJson = JSON.parse(packageJsonFile.toString());
      packageName = packageJson.name;
      version = packageJson.version;
    } catch (error) {
      logger.warn("Error reading package.json or it doesn't exist:", error);
    } finally {
      await rm(repoDir, { recursive: true });
    }
  } else {
    logger.error("Error cloning the repository");
  }
  // If package.json doesn't exist, fall back to the GitHub repo name
  // If the GitHub repo name is invalid, return null
  // If the version is not found, fall back to version 1.0.0
  if (!packageName) {
    logger.warn("No package.json or package name found, falling back to GitHub repo name.");
    const githubRegex = /github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)/;
    const match = url.match(githubRegex);
    if (match?.groups) {
      packageName = match.groups.repo;
      try {
        const npmPackageDetails = await getNpmPackageDetails(packageName);
        if (npmPackageDetails) {
          logger.info(
            `Found package in npm registry: ${npmPackageDetails.packageName}, version: ${npmPackageDetails.version}`
          );
          version = version || npmPackageDetails.version;
        } else {
          logger.error("Invalid npm package name or package not found in npm registry.");
        }
      } catch (error) {
        logger.error(`Error fetching package details from npm registry: ${(error as Error).message}`);
      }
    } else {
      logger.error("Invalid GitHub URL format.");
    }
  }
  if (!packageName) {
    logger.error("Could not find valid package name.");
    return null;
  }
  if (!version) {
    logger.warn("No version found, falling back to version 1.0.0");
    version = "1.0.0";
  }
  return { packageName, version };
};

/**
 * Get package details from npm registry API
 * @param packageName The npm package name
 * @returns Object containing packageName and version
 */
export async function getNpmPackageDetails(
  packageName: string
): Promise<{ packageName: string; version: string; dependencies: { [dependency: string]: string } } | null> {
  try {
    const npmUrl = `https://registry.npmjs.org/${packageName}`;
    const response = await fetch(npmUrl);
    if (!response.ok) return null;
    const data = await response.json();
    const dependencies = data.versions[data["dist-tags"].latest].dependencies || {};
    return {
      packageName: data.name,
      version: data["dist-tags"].latest,
      dependencies: dependencies
    };
  } catch (error) {
    logger.error(`Error fetching npm package details for ${packageName}: ${(error as Error).message}`);
    return null;
  }
}
