import { Ndjson, assertIsNdjson } from "@package-rater/shared";

export type Metadata = {
  byId: {
    [id: string]: {
      packageName: string;
      version: string;
      ndjson: Ndjson | null;
      dependencies: {
        [dependency: string]: string;
      };
      standaloneCost: number;
      totalCost: number;
      costStatus: "pending" | "completed" | "failed";
    };
  };
  byName: {
    [packageName: string]: {
      [version: string]: {
        id: string;
        ndjson: Ndjson | null;
        dependencies: {
          [dependency: string]: string;
        };
        standaloneCost: number;
        totalCost: number;
        costStatus: "pending" | "completed" | "failed";
      };
    };
  };
  // Cache for all packages and dependencies (which may or may not be in the byId or byName maps)
  costCache: {
    [id: string]: {
      cost: number;
      costStatus: "pending" | "completed" | "failed";
    };
  };
};

export function assertIsMetadata(o: any): asserts o is Metadata {
  if (!o || typeof o !== "object") {
    throw new Error("Metadata must be an object");
  }
  if (typeof o.byId !== "object") {
    throw new Error("Metadata.byId must be an object");
  }
  if (typeof o.byName !== "object") {
    throw new Error("Metadata.byName must be an object");
  }
  for (const id in o.byId) {
    const v = o.byId[id];
    if (typeof v !== "object") {
      throw new Error("Metadata.byId values must be objects");
    }
    if (typeof v.packageName !== "string") {
      throw new Error("Metadata.byId values.packageName must be a string");
    }
    if (typeof v.version !== "string") {
      throw new Error("Metadata.byId values.version must be a string");
    }
    if (v.ndjson !== null) {
      assertIsNdjson(v.ndjson);
    }
    if (typeof v.dependencies !== "object") {
      throw new Error("Metadata.byId values.dependencies must be an object");
    }
    for (const dependency in v.dependencies) {
      if (typeof v.dependencies[dependency] !== "string") {
        throw new Error("Metadata.byId values.dependencies values must be strings");
      }
    }
    if (typeof v.standaloneCost !== "number") {
      throw new Error("Metadata.byId values.standaloneCost must be a number");
    }
    if (typeof v.totalCost !== "number") {
      throw new Error("Metadata.byId values.totalCost must be a number");
    }
    if (v.costStatus !== "pending" && v.costStatus !== "completed" && v.costStatus !== "failed") {
      throw new Error("Metadata.byId values.costStatus must be 'pending', 'completed', or 'failed'");
    }
  }
  for (const packageName in o.byName) {
    const v = o.byName[packageName];
    if (typeof v !== "object") {
      throw new Error("Metadata.byName values must be objects");
    }
    for (const version in v) {
      const vv = v[version];
      if (typeof vv !== "object") {
        throw new Error("Metadata.byName values values must be objects");
      }
      if (typeof vv.id !== "string") {
        throw new Error("Metadata.byName values values.id must be a string");
      }
      if (vv.ndjson !== null) {
        assertIsNdjson(vv.ndjson);
      }
      if (typeof vv.dependencies !== "object") {
        throw new Error("Metadata.byName values values.dependencies must be an object");
      }
      for (const dependency in vv.dependencies) {
        if (typeof vv.dependencies[dependency] !== "string") {
          throw new Error("Metadata.byName values values.dependencies values must be strings");
        }
      }
      if (typeof vv.standaloneCost !== "number") {
        throw new Error("Metadata.byName values values.standaloneCost must be a number");
      }
      if (typeof vv.totalCost !== "number") {
        throw new Error("Metadata.byName values values.totalCost must be a number");
      }
      if (vv.costStatus !== "pending" && vv.costStatus !== "completed" && vv.costStatus !== "failed") {
        throw new Error("Metadata.byName values values.costStatus must be 'pending', 'completed', or 'failed'");
      }
    }
  }
  if (typeof o.costCache !== "object") {
    throw new Error("Metadata.costCache must be an object");
  }
  for (const id in o.costCache) {
    const v = o.costCache[id];
    if (typeof v !== "object") {
      throw new Error("Metadata.costCache values must be objects");
    }
    if (typeof v.cost !== "number") {
      throw new Error("Metadata.costCache values.cost must be a number");
    }
    if (v.costStatus !== "pending" && v.costStatus !== "completed" && v.costStatus !== "failed") {
      throw new Error("Metadata.costCache values.costStatus must be 'pending', 'completed', or 'failed'");
    }
  }
}
