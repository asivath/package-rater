import { rename } from "fs";
import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { pipeline } from "stream";
import { createGzip } from "zlib";

/**
 * Moves a package to the packages directory and saves its metadata
 * @param packageName The name of the package
 * @param version The version of the package
 * @param id The ID of the package
 * @param packageFilePath The path to the package file
 * @param url The URL of the package
 */
export const savePackage = async (
  packageName: string,
  version: string,
  id: string,
  packageFilePath: string,
  url?: string
) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packagePath = path.join(__dirname, "packages", id);
  await mkdir(packagePath, { recursive: true });
  const gzip = createGzip();

  const newPackageFilePath = path.join(packagePath, path.basename(packageFilePath));
  await rename(packageFilePath, newPackageFilePath);

  if (url) {
  }

  const zipFilePath = `${newPackageFilePath}.gz`;
  const gzip = createGzip();
  const sourceStream = await open(newPackageFilePath, "r");
  const destinationStream = await open(zipFilePath, "w");
  await pipeline(sourceStream, gzip, destinationStream);
  await sourceStream.close();
  await destinationStream.close();

  const metadata = await readFile("./packages/metadata.json", "utf-8");
  const metadataJson = JSON.parse(metadata);
  metadataJson[id] = { packageName, version, score, type };
  await writeFile("./packages/metadata.json", JSON.stringify(metadataJson));
};

/**
 * Checks if the package exists
 * @param id The package ID
 * @returns Whether the package exists
 */
export const checkIfPackageExists = async (id: string) => {
  const metadata = await readFile("./packages/metadata.json", "utf-8");
  const metadataJson = JSON.parse(metadata);
  return metadataJson[id] ? true : false;
};

/**
 * Gets the metadata of a package
 * @param id The package ID
 * @returns The package metadata or null if it doesn't exist
 */
export const getPackageMetadata = async (id: string) => {
  const metadata = await readFile("./packages/metadata.json", "utf-8");
  const metadataJson = JSON.parse(metadata);
  const packageMetadata = metadataJson[id];
  if (!packageMetadata) {
    return null;
  }
  return packageMetadata;
};
