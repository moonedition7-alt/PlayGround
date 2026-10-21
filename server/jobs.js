import fs from 'node:fs/promises';
import path from 'node:path';
import { config, isProviderConfigured } from './config.js';
import { TERMINAL_STATUSES } from './store.js';
import * as replicate from './providers/replicate.js';

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class JobManager {
  constructor(store, provider = replicate, options = {}) {
    this.store = store;
    this.provider = provider;
    this.queue = [];
    this.active = new Map();
    this.concurrency = options.concurrency ?? config.concurrency;
    this.pollIntervalMs = options.pollIntervalMs ?? config.pollIntervalMs;
    this.jobTimeoutMs = options.jobTimeoutMs ?? config.jobTimeoutMs;
  }

  init() {
    if (!isProviderConfigured()) {
      for (const job of this.store.listAll()) {
        if (TERMINAL_STATUSES.has(job.status)) continue;
        this.store.update(job.id, {
          status: 'failed',
          stage: 'Provider not configured',
          error: 'The server restarted without REPLICATE_API_TOKEN. Add the key and try again.',
          completedAt: nowIso(),
        });
      }
      return;
    }

    for (const job of this.store.listAll()) {
      if (TERMINAL_STATUSES.has(job.status)) continue;
      if (job.status === 'downloading' && job.videoFile) continue;
      this.store.update(job.id, {
        status: 'queued',
        stage: 'Resuming after restart',
        cancelRequested: false,
      });
      this.enqueue(job.id);
    }
  }

  enqueue(id) {
    if (!isProviderConfigured()) return;
    if (this.active.has(id) || this.queue.includes(id)) return;
    const job = this.store.get(id);
    if (!job || TERMINAL_STATUSES.has(job.status) || job.cancelRequested) return;
    this.queue.push(id);
    this.pump();
  }

  pump() {
    while (this.active.size < this.concurrency && this.queue.length > 0) {
      const id = this.queue.shift();
      const job = this.store.get(id);
      if (!job || TERMINAL_STATUSES.has(job.status) || job.cancelRequested) continue;

      const task = this.runJob(id)
        .catch((error) => {
          console.error(`[jobs] Unhandled job error for ${id}:`, error?.message ?? error);
          this.failJob(id, error);
        })
        .finally(() => {
          this.active.delete(id);
          this.pump();
        });

      this.active.set(id, task);
    }
  }

  async runJob(id) {
    let job = this.store.get(id);
    if (!job) return;

    if (job.cancelRequested || job.status === 'canceled') {
      await this.markCanceled(id);
      return;
    }

    try {
      if (!job.predictionId) {
        this.store.update(id, {
          status: 'starting',
          stage: 'Submitting to Replicate',
          progress: Math.max(job.progress ?? 2, 5),
          startedAt: job.startedAt ?? nowIso(),
          etaSeconds: job.estimatedSeconds ?? null,
        });

        const imageDataUrl = job.sourceImage ? await this.readSourceImage(job) : undefined;
        const prediction = await this.provider.createPrediction({
          prompt: job.prompt,
          duration: job.duration,
          aspectRatio: job.aspectRatio,
          resolution: job.resolution,
          imageDataUrl,
        });

        job = this.store.update(id, {
          predictionId: prediction.id,
          status: prediction.status === 'processing' ? 'processing' : 'starting',
        });
        await this.pollJob(id, prediction);
        return;
      }

      const prediction = await this.provider.getPrediction(job.predictionId);
      await this.pollJob(id, prediction);
    } catch (error) {
      const current = this.store.get(id);
      if (!current) return;
      if (current.status === 'canceled' || current.cancelRequested) {
        await this.markCanceled(id);
        return;
      }
      console.error(`[jobs] ${id} failed:`, error?.message ?? error);
      this.failJob(id, error);
    }
  }

  async pollJob(id, initialPrediction) {
    let prediction = initialPrediction;
    let consecutiveErrors = 0;
    const deadline = Date.now() + this.jobTimeoutMs;

    while (true) {
      const current = this.store.get(id);
      if (!current) return;

      if (current.cancelRequested || current.status === 'canceled') {
        await this.safeCancel(current.predictionId);
        await this.markCanceled(id);
        return;
      }

      if (prediction.status === 'succeeded') {
        await this.finishSucceeded(id, prediction);
        return;
      }

      if (prediction.status === 'failed') {
        const reason =
          typeof prediction.error === 'string' && prediction.error.trim()
            ? prediction.error.trim()
            : 'The AI model reported that generation failed.';
        throw new Error(reason);
      }

      if (prediction.status === 'canceled') {
        await this.markCanceled(id);
        return;
      }

      if (Date.now() > deadline) {
        await this.safeCancel(current.predictionId);
        throw new Error(
          `Generation took longer than ${Math.round(this.jobTimeoutMs / 60000)} minutes and was canceled.`,
        );
      }

      this.applyProgress(id, prediction);
      await sleep(this.pollIntervalMs);

      const afterSleep = this.store.get(id);
      if (!afterSleep || afterSleep.cancelRequested || afterSleep.status === 'canceled') {
        await this.safeCancel(afterSleep?.predictionId);
        await this.markCanceled(id);
        return;
      }

      try {
        prediction = await this.provider.getPrediction(afterSleep.predictionId);
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 5) throw error;
        this.store.update(id, {
          stage: 'Reconnecting to Replicate',
          progress: Math.max(afterSleep.progress ?? 5, 10),
        });
        await sleep(Math.min(8000, this.pollIntervalMs * consecutiveErrors));
      }
    }
  }

  applyProgress(id, prediction) {
    const job = this.store.get(id);
    if (!job) return;

    const elapsed = job.startedAt
      ? Math.max(0, (Date.now() - new Date(job.startedAt).getTime()) / 1000)
      : 0;
    const estimate = job.estimatedSeconds || 30;
    const logPercent = this.provider.parseProgressFromLogs(prediction.logs);

    let heuristic = 8;
    if (prediction.status === 'processing') {
      heuristic = Math.min(92, 12 + (elapsed / estimate) * 80);
    }
    if (logPercent !== null) {
      heuristic = Math.max(heuristic, Math.min(95, logPercent));
    }

    const progress = Math.max(job.progress ?? 2, Math.round(heuristic));
    const stage =
      prediction.status === 'starting'
        ? 'Starting the model'
        : prediction.status === 'processing'
          ? 'Rendering frames'
          : 'Working';

    this.store.update(id, {
      status: prediction.status === 'processing' ? 'processing' : 'starting',
      stage,
      progress,
      etaSeconds: Math.max(0, Math.ceil(estimate - elapsed)),
    });
  }

  async finishSucceeded(id, prediction) {
    const job = this.store.get(id);
    if (!job || job.cancelRequested || job.status === 'canceled') {
      await this.markCanceled(id);
      return;
    }

    const outputUrl = this.provider.extractOutputUrl(prediction);
    if (!outputUrl) {
      throw new Error(
        'Replicate finished but did not return a downloadable video URL. Check the model output format.',
      );
    }

    this.store.update(id, {
      status: 'downloading',
      stage: 'Saving your video',
      progress: 95,
      remoteOutput: outputUrl,
      etaSeconds: 3,
      error: null,
    });

    const destination = path.join(config.videosDir, id);
    const saved = await this.provider.downloadOutput(outputUrl, destination);

    const afterDownload = this.store.get(id);
    if (!afterDownload || afterDownload.cancelRequested || afterDownload.status === 'canceled') {
      await fs.rm(saved.path, { force: true }).catch(() => {});
      await this.markCanceled(id);
      return;
    }

    this.store.update(id, {
      status: 'succeeded',
      stage: 'Ready',
      progress: 100,
      videoFile: path.basename(saved.path),
      videoMime: saved.mime,
      completedAt: nowIso(),
      etaSeconds: 0,
      error: null,
    });
  }

  failJob(id, error) {
    const job = this.store.get(id);
    if (!job || job.status === 'canceled') return;
    this.store.update(id, {
      status: 'failed',
      stage: 'Generation failed',
      error: this.provider.describeError(error),
      completedAt: nowIso(),
      etaSeconds: 0,
    });
  }

  async cancel(id) {
    const job = this.store.get(id);
    if (!job) return null;
    if (TERMINAL_STATUSES.has(job.status)) return job;

    const queueIndex = this.queue.indexOf(id);
    if (queueIndex >= 0) this.queue.splice(queueIndex, 1);

    this.store.update(id, {
      cancelRequested: true,
      status: 'canceled',
      stage: 'Canceled',
      completedAt: nowIso(),
      etaSeconds: 0,
    });

    if (job.predictionId) await this.safeCancel(job.predictionId);
    return this.store.get(id);
  }

  async markCanceled(id) {
    const job = this.store.get(id);
    if (!job) return;
    this.store.update(id, {
      status: 'canceled',
      stage: 'Canceled',
      cancelRequested: true,
      completedAt: job.completedAt ?? nowIso(),
      etaSeconds: 0,
    });
  }

  async safeCancel(predictionId) {
    if (!predictionId) return;
    try {
      await this.provider.cancelPrediction(predictionId);
    } catch (error) {
      console.warn('[jobs] Could not cancel prediction:', error?.message ?? error);
    }
  }

  async readSourceImage(job) {
    const filename = path.basename(job.sourceImage);
    const filePath = path.join(config.uploadsDir, filename);
    let buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      throw new Error('The source image is no longer available. Please upload it again.');
    }
    if (buffer.byteLength > config.maxImageBytes) {
      throw new Error('The source image is too large for the video provider.');
    }
    const mime = job.sourceMime || 'image/jpeg';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }
}
