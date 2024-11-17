import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFile, mkdir, writeFile, rm, cp, access, readdir, stat } from "fs/promises";
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

let metadata: Metadata;
async function loadMetadata(): Promise<void> {
  const metadataFile = JSON.parse(await readFile(metadataPath, "utf-8"));
  assertIsMetadata(metadataFile);
  metadata = metadataFile;
}
await loadMetadata();

const packageCostPromisesMap = new Map<string, Promise<number>>();

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
    let pathToTarGz = packageIdPath;
    let packageJson = null;
    let loosePath = packageIdPath;
    // File path where the package will copied to, folder called the package name inside the package ID directory e.g. packages/react/1234567890abcdef/react
    // We don't copy the package to the package ID directory directly because we need to eventually tar the entire directory then delete
    if (packageFilePath) {
      // Given file path
      const targetUploadFilePath = path.join(packageIdPath, packageName);
      await cp(packageFilePath, targetUploadFilePath, { recursive: true });

      if (debloat) {
        await minifyProject(packageIdPath);

        logger.info(`Finished debloating package ${packageName} v${version}`);
      }
      const packageJsonPath = path.join(targetUploadFilePath, "package.json");

      packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8")) as {
        repository: { url: string };
        dependencies: { [key: string]: string };
      };
      if (!packageJson.repository || !packageJson.repository.url) {
        return { success: false, reason: "Package score is too low" };
      }

      url = packageJson.repository.url;

      const tarGzFilePath = path.join(packageIdPath, `${packageName}.tgz`);
      await create({ gzip: true, file: tarGzFilePath, cwd: packageIdPath }, [packageName]);
      await rm(targetUploadFilePath, { recursive: true });

      pathToTarGz = tarGzFilePath;
      loosePath = targetUploadFilePath;
    } else {
      // Given a url
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
      packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

      await rm(extractPath, { recursive: true });

      pathToTarGz = tarballPath;
      loosePath = extractPath;
    }

    if (process.env.NODE_ENV === "production") {
      await uploadToS3(packageName, id, pathToTarGz);
      await rm(packageNamePath, { recursive: true });
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

    dependencies = packageJson.dependencies || {};
    standaloneCost = (await getFolderSize.loose(loosePath)) / 1024 / 1024;

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
    calculateTotalPackageCost(packageName, version);
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
      const npmTarURL = `https://registry.npmjs.org/${packageName}/-/${packageName}-${exactVersion}.tgz`;
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

      const tmpDir = path.join(tmpdir(), `${packageName}-${exactVersion}`);
      await mkdir(tmpDir, { recursive: true });
      const tarballPath = path.join(tmpDir, `${packageName}.tgz`);
      const tarballStream = createWriteStream(tarballPath);
      await pipeline(tarResponse.body, tarballStream);

      await extract({ file: tarballPath, cwd: tmpDir });
      const extractPath = path.join(tmpDir, "package");
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
        standaloneCost: (await getFolderSize.loose(extractPath)) / 1024 / 1024,
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
      logger.error(`Failed to fetch package ${packageName} with version ${exactVersion}: ${(error as Error).message}`);
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
  const calculateCost = async () => {
    const graph = await buildDependencyGraph(packageName, version);
    const totalCost = await calculateTotalCost(graph);
    packageDataById.totalCost = totalCost;
    packageDataById.costStatus = "completed";
    metadata.byName[packageName][version].totalCost = totalCost;
    metadata.byName[packageName][version].costStatus = "completed";

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
    metadata.byName[packageName][version].costStatus = "failed";
    return 0;
  } finally {
    packageCostPromisesMap.delete(id);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
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
 * Gets the metadata object
 * @returns The metadata object
 */
export const getMetadata = () => {
  return metadata;
};

/**
 * Writes the metadata object to the metadata file
 * @returns write of file
 */
export const writeMetadata = () => {
  return writeFile(metadataPath, JSON.stringify(metadata, null, 2));
};

/**
 * Deletes a package from the server
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
