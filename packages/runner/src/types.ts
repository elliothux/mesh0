export interface RunnerOptions {
  runtimeDir: string;
  workspace: string;
  outputDir: string;
  runJson: string;
  apiUrl?: string;
  runId?: string;
}

export interface OutputObject {
  key: string;
  path: string;
  size: number;
  digest: string;
  contentType: string;
}

export type RunnerStatus = "completed" | "failed";
