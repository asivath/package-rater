import { Ndjson, assertIsNdjson } from "@package-rater/shared";

export type Metadata = {
  byId: {
    [id: string]: {
      packageName: string;
      version: string;
      ndjson: Ndjson | null;
    };
  };
  byName: {
    [packageName: string]: {
      [version: string]: {
        id: string;
        ndjson: Ndjson | null;
      };
    };
  };
};

export function assertIsMetadata(o: any): asserts o is Metadata {
  if (typeof o !== "object") {
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
    }
  }
}
