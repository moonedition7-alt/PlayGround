import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const nowIso = () => new Date().toISOString();

export const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export class JobStore {
  constructor() {
    this.jobs = new Map();
    this.writeChain = Promise.resolve();
  }

  async init() {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.mkdir(config.uploadsDir, { recursive: true });
    await fs.mkdir(config.videosDir, { recursive: true });

    try {
      const raw = await fs.readFile(config.jobsFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const job of parsed) {
          if (job && typeof job.id === 'string') this.jobs.set(job.id, job);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[store] Could not read jobs.json:', error.message);
      }
    }
  }

  create(job) {
    const timestamp = nowIso();
    const record = {
      id: crypto.randomUUID(),
      status: 'queued',
      stage: 'In queue',
      progress: 2,
      error: null,
      predictionId: null,
      remoteOutput: null,
      videoFile: null,
      videoMime: null,
      sourceImage: null,
      sourceMime: null,
      startedAt: null,
      completedAt: null,
      cancelRequested: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...job,
    };
    this.jobs.set(record.id, record);
    this.persist();
    return record;
  }

  get(id) {
    return this.jobs.get(id) ?? null;
  }

  listAll() {
    return [...this.jobs.values()];
  }

  listForClient(clientId, limit = 50) {
    return this.listAll()
      .filter((job) => job.clientId === clientId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  update(id, patch) {
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: nowIso() });
    this.persist();
    return job;
  }

  remove(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    this.jobs.delete(id);
    this.persist();
    this.removeFiles(job);
    return true;
  }

  async removeFiles(job) {
    const files = [
      job.videoFile ? path.join(config.videosDir, path.basename(job.videoFile)) : null,
      job.sourceImage ? path.join(config.uploadsDir, path.basename(job.sourceImage)) : null,
    ].filter(Boolean);

    await Promise.all(
      files.map((file) => fs.rm(file, { force: true }).catch(() => {})),
    );
  }

  persist() {
    const snapshot = this.listAll();
    this.writeChain = this.writeChain
      .then(async () => {
        const temp = `${config.jobsFile}.tmp`;
        await fs.writeFile(temp, JSON.stringify(snapshot, null, 2), 'utf8');
        await fs.rename(temp, config.jobsFile);
      })
      .catch((error) => {
        console.error('[store] Failed to persist jobs:', error.message);
      });
    return this.writeChain;
  }

  async pruneOldJobs() {
    const cutoff = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
    const removable = this.listAll().filter(
      (job) => TERMINAL_STATUSES.has(job.status) && new Date(job.createdAt).getTime() < cutoff,
    );
    for (const job of removable) this.remove(job.id);
    if (removable.length > 0) {
      console.log(`[store] Pruned ${removable.length} job(s) older than ${config.retentionDays} days`);
    }
  }

  async markInterruptedJobs() {
    for (const job of this.listAll()) {
      if (job.status !== 'succeeded') continue;
      const videoPath = job.videoFile
        ? path.join(config.videosDir, path.basename(job.videoFile))
        : null;
      const exists = videoPath ? await fs.access(videoPath).then(() => true).catch(() => false) : false;
      if (!exists) {
        this.update(job.id, {
          status: 'failed',
          stage: 'Video file missing',
          error: 'The stored video file is no longer available. Please generate it again.',
          completedAt: nowIso(),
        });
      }
    }
  }
}

export function toPublicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    mode: job.mode,
    prompt: job.prompt,
    duration: job.duration,
    aspectRatio: job.aspectRatio,
    resolution: job.resolution,
    error: job.error,
    estimatedSeconds: job.estimatedSeconds ?? null,
    etaSeconds: job.etaSeconds ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    provider: job.provider,
    model: job.model,
    videoUrl: job.videoFile ? `/api/jobs/${job.id}/video` : null,
    downloadUrl: job.videoFile ? `/api/jobs/${job.id}/download` : null,
    sourceImageUrl: job.sourceImage ? `/api/jobs/${job.id}/source` : null,
  };
}
