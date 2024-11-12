export type Ndjson = {
  URL: string;
  NetScore: number;
  NetScore_Latency: number;
  RampUp: number;
  RampUp_Latency: number;
  Correctness: number;
  Correctness_Latency: number;
  BusFactor: number;
  BusFactor_Latency: number;
  ResponsiveMaintainer: number;
  ResponsiveMaintainer_Latency: number;
  License: number;
  License_Latency: number;
  Dependencies: number;
  Dependencies_Latency: number;
};

export type PackageCostResponse = {
  [id: string]: {
    standaloneCost: number;
    totalCost: number;
  };
};

export function assertIsPackageCostResponse(o: any): asserts o is PackageCostResponse {
  if (!o || typeof o !== "object") {
    throw new Error("PackageCostResponse is not an object");
  }
  for (const key in o) {
    if (typeof key !== "string") {
      throw new Error("PackageCostResponse key is not a string");
    }
    const value = o[key];
    if (!value || typeof value !== "object") {
      throw new Error("PackageCostResponse value is not an object");
    }
    if (typeof value.standaloneCost !== "number") {
      throw new Error("PackageCostResponse.standaloneCost is not a number");
    }
    if (typeof value.totalCost !== "number") {
      throw new Error("PackageCostResponse.totalCost is not a number");
    }
  }
}

export function assertIsNdjson(o: any): asserts o is Ndjson {
  if (!o || typeof o !== "object") {
    throw new Error("Ndjson is not an object");
  }
  if (typeof o.URL !== "string") {
    throw new Error("Ndjson.URL is not a string");
  }
  if (typeof o.NetScore !== "number") {
    throw new Error("Ndjson.NetScore is not a number");
  }
  if (typeof o.NetScore_Latency !== "number") {
    throw new Error("Ndjson.NetScore_Latency is not a number");
  }
  if (typeof o.RampUp !== "number") {
    throw new Error("Ndjson.RampUp is not a number");
  }
  if (typeof o.RampUp_Latency !== "number") {
    throw new Error("Ndjson.RampUp_Latency is not a number");
  }
  if (typeof o.Correctness !== "number") {
    throw new Error("Ndjson.Correctness is not a number");
  }
  if (typeof o.Correctness_Latency !== "number") {
    throw new Error("Ndjson.Correctness_Latency is not a number");
  }
  if (typeof o.BusFactor !== "number") {
    throw new Error("Ndjson.BusFactor is not a number");
  }
  if (typeof o.BusFactor_Latency !== "number") {
    throw new Error("Ndjson.BusFactor_Latency is not a number");
  }
  if (typeof o.ResponsiveMaintainer !== "number") {
    throw new Error("Ndjson.ResponsiveMaintainer is not a number");
  }
  if (typeof o.ResponsiveMaintainer_Latency !== "number") {
    throw new Error("Ndjson.ResponsiveMaintainer_Latency is not a number");
  }
  if (typeof o.License !== "number") {
    throw new Error("Ndjson.License is not a number");
  }
  if (typeof o.License_Latency !== "number") {
    throw new Error("Ndjson.License_Latency is not a number");
  }
  if (typeof o.Dependencies !== "number") {
    throw new Error("Ndjson.Dependencies is not a number");
  }
  if (typeof o.Dependencies_Latency !== "number") {
    throw new Error("Ndjson.Dependencies_Latency is not a number");
  }
}
