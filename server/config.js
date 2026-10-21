import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(here, '..');

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(rootDir, 'server', 'data');

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const resolution = ['480p', '720p', '1080p'].includes(process.env.REPLICATE_RESOLUTION ?? '')
  ? process.env.REPLICATE_RESOLUTION
  : '720p';

export const config = {
  isProd: process.env.NODE_ENV === 'production',
  port: asInt(process.env.PORT, 3001),
  rootDir,
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  videosDir: path.join(dataDir, 'videos'),
  jobsFile: path.join(dataDir, 'jobs.json'),
  replicateToken: (process.env.REPLICATE_API_TOKEN ?? '').trim(),
  model: (process.env.REPLICATE_MODEL ?? 'bytedance/seedance-1-lite').trim(),
  modelVersion: (process.env.REPLICATE_MODEL_VERSION ?? '').trim(),
  resolution,
  concurrency: clamp(asInt(process.env.JOB_CONCURRENCY, 2), 1, 4),
  pollIntervalMs: clamp(asInt(process.env.POLL_INTERVAL_MS, 3000), 1500, 15000),
  jobTimeoutMs: clamp(asInt(process.env.JOB_TIMEOUT_MS, 15 * 60 * 1000), 60000, 60 * 60 * 1000),
  retentionDays: clamp(asInt(process.env.RETENTION_DAYS, 7), 1, 90),
  maxPromptLength: 1500,
  maxImageBytes: 4 * 1024 * 1024,
  modelLabel: 'Seedance 1.0 Lite',
  setupUrl: 'https://replicate.com/account/api-tokens',
  pricingUrl: 'https://replicate.com/pricing',
  docsUrl: 'https://replicate.com/docs',
};

export const isProviderConfigured = () => Boolean(config.replicateToken);
