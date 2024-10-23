import { readFile, mkdir, writeFile, rename, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { getLogger } from "@package-rater/shared";
import { create } from "tar";
import { pipeline } from "stream/promises";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesDirPath = path.join(__dirname, "..", "packages");
const metadataPath = path.join(packagesDirPath, "metadata.json");

/**
 * Moves a package to the packages directory and saves its metadata
 * @param packageName The name of the package
 * @param version The version of the package
 * @param id The ID of the package
 * @param packageFilePath The path to the package file (provide either packageFilePath or url)
 * @param url The URL of the package (provide either packageFilePath or url)
 * @returns Whether the package was saved successfully and the ID of the package
 */
export const savePackage = async (
  packageName: string,
  version: string,
  id: string,
  packageFilePath?: string,
  url?: string
): Promise<{ success: boolean; reason?: string; id?: string }> => {
  if (!packageFilePath && !url) {
    return { success: false, reason: "No package file path or URL provided" };
  }
  if (packageFilePath && url) {
    return { success: false, reason: "Provide either package file path or URL, not both" };
  }
  try {
    const packagePath = path.join(packagesDirPath, id);
    let ndjson = null;
    if (packageFilePath) {
      await mkdir(packagePath, { recursive: true });

      const newPackageFilePath = path.join(packagePath, path.basename(packageFilePath));
      await rename(packageFilePath, newPackageFilePath);

      const tarGzFilePath = path.join(newPackageFilePath, `${id}.tgz`);
      await create(
        {
          gzip: true,
          file: tarGzFilePath,
          cwd: packagePath
        },
        [path.basename(newPackageFilePath)]
      );
      await unlink(newPackageFilePath);
    } else {
      const execAsync = promisify(exec);
      const { stdout, stderr } = await execAsync(`./run --url ${url}`, { cwd: path.join(__dirname, "..", "..", "cli") });
      if (stderr) {
        return { success: false, reason: stderr };
      }
      ndjson = JSON.parse(stdout);
      const score = parseFloat(ndjson.NetScore);
      if (isNaN(score) || score < 0.5) {
        return { success: false, reason: "Package score is too low" };
      }

      const npmTarURL = `https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`;
      const response = await fetch(npmTarURL);
      if (!response.ok || !response.body) {
        return { success: false, reason: "Failed to fetch package" };
      }

      await mkdir(packagePath, { recursive: true });
      const tarballPath = path.join(packagePath, `${id}.tgz`);
      const tarballStream = createWriteStream(tarballPath);
      await pipeline(response.body, tarballStream);
    }

    const metadata = await readFile(metadataPath, "utf-8");
    const metadataJson = JSON.parse(metadata);
    metadataJson[id] = { packageName, version, ndjson };
    await writeFile(metadataPath, JSON.stringify(metadataJson, null, 2));
    logger.info(`Saved package ${packageName} v${version} with ID ${id}`);
    return { success: true, id };
  } catch (error) {
    return { success: false, reason: (error as Error).message };
  }
};

/**
 * Checks if the package exists
 * @param id The package ID
 * @returns Whether the package exists
 */
export const checkIfPackageExists = async (id: string) => {
  const metadata = await readFile(metadataPath, "utf-8");
  const metadataJson = JSON.parse(metadata);
  return metadataJson[id] ? true : false;
};

/**
 * Gets the metadata of a package
 * @param id The package ID
 * @returns The package metadata or null if it doesn't exist
 */
export const getPackageMetadata = async (id: string) => {
  const metadata = await readFile(metadataPath, "utf-8");
  const metadataJson = JSON.parse(metadata);
  const packageMetadata = metadataJson[id];
  if (!packageMetadata) {
    return null;
  }
  return packageMetadata;
};
