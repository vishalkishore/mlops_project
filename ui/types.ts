export enum AppFeature {
  IMAGE_ANALYSIS = "IMAGE_ANALYSIS",
  ADVANCED_GENERATOR = "ADVANCED_GENERATOR",
}

export interface AnalysisResult {
  text: string;
  timestamp: number;
}

export interface SystemMetric {
  time: string;
  cpu: number;
  memory: number;
  gpu: number;
}

export interface Metric {
  timestamp: number; // milliseconds since epoch
  cpu: number; // CPU usage in percent (0–100)
  gpu: number; // GPU usage in percent (0–100)
  memory: number; // RAM usage in percent (0–100)
}
