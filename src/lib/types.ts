export type JobStatus =
  | 'queued'
  | 'starting'
  | 'processing'
  | 'downloading'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface Job {
  id: string;
  status: JobStatus;
  stage: string;
  progress: number;
  mode: 'text' | 'image';
  prompt: string;
  duration: 5 | 10;
  aspectRatio: '9:16' | '16:9' | '1:1';
  resolution: '480p' | '720p' | '1080p';
  error: string | null;
  estimatedSeconds: number | null;
  etaSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  provider: string;
  model: string;
  videoUrl: string | null;
  downloadUrl: string | null;
  sourceImageUrl: string | null;
}

export interface AppConfig {
  configured: boolean;
  provider: string;
  model: string;
  modelLabel: string;
  defaultResolution: '480p' | '720p' | '1080p';
  limits: {
    promptMax: number;
    durations: number[];
    aspectRatios: string[];
    resolutions: string[];
    maxImageMb: number;
  };
  pricingPerSecond: Record<string, number>;
  setupUrl: string;
  pricingUrl: string;
  docsUrl: string;
  freeTierNote: string;
}

export interface GenerationRequest {
  mode: 'text' | 'image';
  prompt: string;
  duration: 5 | 10;
  aspectRatio: '9:16' | '16:9' | '1:1';
  resolution: '480p' | '720p' | '1080p';
  image?: File | null;
}
