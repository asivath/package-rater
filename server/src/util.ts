import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFile, mkdir, writeFile, rm, cp, readdir, stat } from "fs/promises";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import { getLogger } from "@package-rater/shared";
import { create, extract } from "tar";
import { pipeline } from "stream/promises";
import esbuild from "esbuild";
import path from "path";
import "dotenv/config";

const logger = getLogger("server");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packagesDirPath = path.join(__dirname, "..", "packages");
const metadataPath = path.join(packagesDirPath, "metadata.json");

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
  try {
    const packageBasePath = path.join(packagesDirPath, packageName);
    const packagePath = path.join(packageBasePath, id);
    let ndjson = null;
    if (packageFilePath) {
      await mkdir(packagePath, { recursive: true });

      const newPackageFilePath = path.join(packagePath, path.basename(packageFilePath));
      await cp(packageFilePath, newPackageFilePath, { recursive: true });

      if (debloat) {
        await minifyProject(packagePath);
        logger.info(`Finished debloating package ${packageName} v${version}`);
      }

      const tarGzFilePath = path.join(packagePath, `${packageName}.tgz`);
      await create({ gzip: true, file: tarGzFilePath, cwd: packagePath }, ["."]);
      await rm(newPackageFilePath, { recursive: true });

      if (process.env.NODE_ENV === "production") {
        await uploadToS3(packageName, id, tarGzFilePath);
        await rm(packageBasePath, { recursive: true });
      }
    } else {
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
      } else {
        const execAsync = promisify(exec);
        const { stdout, stderr } = await execAsync(`./run --url ${url}`, {
          cwd: path.join(__dirname, "..", "..", "cli")
        });
        if (stderr) {
          return { success: false, reason: stderr };
        }
        ndjson = JSON.parse(stdout);
      }
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
      const tarballPath = path.join(packagePath, `${packageName}.tgz`);
      const tarballStream = createWriteStream(tarballPath);
      await pipeline(response.body, tarballStream);


      if (debloat) {
        const extractPath = path.join(packagePath, "extract");
        await mkdir(extractPath, { recursive: true });
        await extract({ file: tarballPath, cwd: extractPath });
        await minifyProject(extractPath);
        await create({ gzip: true, file: tarballPath, cwd: extractPath }, ["."]);
        await rm(extractPath, { recursive: true });
        logger.info(`Finished debloating package ${packageName} v${version}`);
      }

      if (process.env.NODE_ENV === "prod") {
        await uploadToS3(packageName, id, tarballPath);
        await rm(packageBasePath, { recursive: true });
      }
    }

    const metadata = await readFile(metadataPath, "utf-8");
    const metadataJson = JSON.parse(metadata);

    if (!metadataJson.byId[id]) {
      metadataJson.byId[id] = {};
    }

    // Initialize `byName[packageName]` if it doesn’t exist as an object
    if (!metadataJson.byName[packageName]) {
      metadataJson.byName[packageName] = {};
    }

    // Add the package metadata to byId and byName
    metadataJson.byId[id] = {
      packageName,
      version,
      ndjson
    };

    // Ensure `byName[packageName]` allows multiple versions by using `version` as a key
    metadataJson.byName[packageName][version] = {
      id,
      ndjson
    };

    await writeFile(metadataPath, JSON.stringify(metadataJson, null, 2));
    logger.info(`Saved package ${packageName} v${version} with ID ${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, reason: (error as Error).message };
  }
};

/**
 * Gets the metadata of a package
 * @param id The package ID
 * @returns The package metadata or null if it doesn't exist
 */
export const getPackageMetadata = async (packageName: string) => {
  const metadata = await readFile(metadataPath, "utf-8");
  const metadataJson = JSON.parse(metadata);
  if (!metadataJson.byName[packageName]) {
    return null;
  }

  const packageMetadata = metadataJson.byName[packageName];

  return packageMetadata;
};

/**
 * Checks if the package exists
 * @param id The package ID
 * @returns Whether the package exists
 */
export const checkIfPackageExists = async (id: string) => {
  const metadata = await readFile(metadataPath, "utf-8");
  const metadataJson = JSON.parse(metadata);
  return metadataJson.byId[id] ? true : false;
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
          console.error(`Error minifying ${filePath}: ${(error as Error).message}`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error minifying project in ${directory}: ${(error as Error).message}`);
    throw error;
  }
};
