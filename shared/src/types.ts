export type Ndjson = {
  BusFactor: number;
  BusFactor_Latency: number;
  Correctness: number;
  Correctness_Latency: number;
  RampUp: number;
  RampUp_Latency: number;
  ResponsiveMaintainer: number;
  ResponsiveMaintainer_Latency: number;
  License: number;
  License_Latency: number;
  GoodPinningPractice: number;
  GoodPinningPracticeLatency: number;
  PullRequest: number;
  PullRequest_Latency: number;
  NetScore: number;
  NetScore_Latency: number;
};

export type PackageCostResponse = {
  [id: string]: {
    standaloneCost: number;
    totalCost: number;
  };
};

export type PackageDisplay = {
  Name: string;
  Version: string;
  ID: string;
  UploadedWithContent?: boolean;
  NetScore?: number | "N/A";
  StandaloneCost?: number;
  TotalCost?: number;
  CostStatus?: string;
};

export function assertIsPackageDisplay(o: any): asserts o is PackageDisplay {
  if (!o || typeof o !== "object") {
    throw new Error("Expected PackageDisplay to be an object");
  }
  if (typeof o.Name !== "string") {
    throw new Error(`Expected PackageDisplay.Name to be a string, but got ${typeof o.Name}`);
  }
  if (typeof o.Version !== "string") {
    throw new Error(`Expected PackageDisplay.Version to be a string, but got ${typeof o.Version}`);
  }
  if (typeof o.ID !== "string") {
    throw new Error(`Expected PackageDisplay.ID to be a string, but got ${typeof o.ID}`);
  }
  if (o.NetScore !== undefined && typeof o.NetScore !== "number" && o.NetScore !== "N/A") {
    throw new Error(`Expected PackageDisplay.NetScore to be a number or 'N/A', but got ${typeof o.NetScore}`);
  }
  if (o.StandaloneCost !== undefined && typeof o.StandaloneCost !== "number") {
    throw new Error(`Expected PackageDisplay.StandaloneCost to be a number, but got ${typeof o.StandaloneCost}`);
  }
  if (o.TotalCost !== undefined && typeof o.TotalCost !== "number") {
    throw new Error(`Expected PackageDisplay.TotalCost to be a number, but got ${typeof o.TotalCost}`);
  }
  if (o.CostStatus !== undefined && typeof o.CostStatus !== "string") {
    throw new Error(`Expected PackageDisplay.CostStatus to be a string, but got ${typeof o.CostStatus}`);
  }
  if (typeof o.UploadedWithContent !== "boolean") {
    throw new Error(
      `Expected PackageDisplay.UploadedWithContent to be a boolean, but got ${typeof o.UploadedWithContent}`
    );
  }
}

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
  if (typeof o.PullRequest !== "number") {
    throw new Error("Ndjson.PullRequest is not a number");
  }
  if (typeof o.PullRequest_Latency !== "number") {
    throw new Error("Ndjson.PullRequest_Latency is not a number");
  }
  if (typeof o.GoodPinningPractice !== "number") {
    throw new Error("Ndjson.GoodPinningPractice is not a number");
  }
  if (typeof o.GoodPinningPracticeLatency !== "number") {
    throw new Error("Ndjson.GoodPinningPracticeLatency is not a number");
  }
}
