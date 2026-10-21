import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'info-ranga-test-'));
process.env.DATA_DIR = tempDir;
process.env.REPLICATE_API_TOKEN = 'test-token-not-real';
process.env.POLL_INTERVAL_MS = '50';
process.env.JOB_TIMEOUT_MS = '5000';

const { JobStore } = await import('../store.js');
const { JobManager } = await import('../jobs.js');

after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  await fs.rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function makeJob(store, overrides = {}) {
  return store.create({
    clientId: 'test-client-12345',
    mode: 'text',
    prompt: 'A test scene with golden light and gentle motion.',
    duration: 5,
    aspectRatio: '16:9',
    resolution: '720p',
    provider: 'Replicate',
    model: 'test/model',
    estimatedSeconds: 1,
    etaSeconds: 1,
    ...overrides,
  });
}

function makeProvider({ fail = false } = {}) {
  let polls = 0;
  const calls = { create: 0, get: 0, download: 0, cancel: 0, lastImage: null };

  return {
    calls,
    async createPrediction(input) {
      calls.create += 1;
      calls.lastImage = input.imageDataUrl ?? null;
      return { id: 'pred-test', status: 'starting', logs: '' };
    },
    async getPrediction() {
      calls.get += 1;
      polls += 1;
      if (fail) {
        return { id: 'pred-test', status: 'failed', error: 'The safety checker rejected this prompt.' };
      }
      if (polls < 2) {
        return { id: 'pred-test', status: 'processing', logs: 'rendering at 55%' };
      }
      return {
        id: 'pred-test',
        status: 'succeeded',
        output: 'https://replicate.delivery/test/out.mp4',
      };
    },
    extractOutputUrl(prediction) {
      return prediction?.output ?? null;
    },
    async downloadOutput(_url, destination) {
      calls.download += 1;
      const filePath = `${destination}.mp4`;
      await fs.writeFile(filePath, Buffer.alloc(4096, 7));
      return { path: filePath, size: 4096, mime: 'video/mp4' };
    },
    async cancelPrediction() {
      calls.cancel += 1;
    },
    parseProgressFromLogs(logs) {
      const match = /(\d{1,3})\s*%/.exec(logs ?? '');
      return match ? Number.parseInt(match[1], 10) : null;
    },
    describeError(error) {
      return `Generation failed: ${error.message}`;
    },
  };
}

function waitForTerminal(store, id, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const job = store.get(id);
      if (!job) {
        clearInterval(timer);
        reject(new Error('Job disappeared'));
        return;
      }
      if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled') {
        clearInterval(timer);
        resolve(job);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for job; last status ${job.status}`));
      }
    }, 25);
  });
}

test('successful job is polled, downloaded and stored', async () => {
  const store = new JobStore();
  await store.init();
  const provider = makeProvider();
  const manager = new JobManager(store, provider, {
    concurrency: 1,
    pollIntervalMs: 25,
    jobTimeoutMs: 3000,
  });

  const job = makeJob(store);
  manager.enqueue(job.id);
  const finished = await waitForTerminal(store, job.id);

  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.progress, 100);
  assert.equal(finished.videoFile, `${job.id}.mp4`);
  assert.equal(provider.calls.download, 1);
  assert.ok(provider.calls.get >= 1);

  const video = await fs.readFile(path.join(tempDir, 'videos', finished.videoFile));
  assert.equal(video.byteLength, 4096);
});

test('image-to-video passes a data URL to the provider', async () => {
  const store = new JobStore();
  await store.init();
  const provider = makeProvider();
  const manager = new JobManager(store, provider, {
    concurrency: 1,
    pollIntervalMs: 25,
    jobTimeoutMs: 3000,
  });

  const job = makeJob(store, { mode: 'image' });
  const imageName = `${job.id}.jpg`;
  await fs.writeFile(path.join(tempDir, 'uploads', imageName), Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]));
  store.update(job.id, { sourceImage: imageName, sourceMime: 'image/jpeg' });

  manager.enqueue(job.id);
  const finished = await waitForTerminal(store, job.id);

  assert.equal(finished.status, 'succeeded');
  assert.match(provider.calls.lastImage, /^data:image\/jpeg;base64,/);
});

test('provider failure surfaces a readable error and no video file', async () => {
  const store = new JobStore();
  await store.init();
  const provider = makeProvider({ fail: true });
  const manager = new JobManager(store, provider, {
    concurrency: 1,
    pollIntervalMs: 25,
    jobTimeoutMs: 3000,
  });

  const job = makeJob(store);
  manager.enqueue(job.id);
  const finished = await waitForTerminal(store, job.id);

  assert.equal(finished.status, 'failed');
  assert.match(finished.error, /safety checker/i);
  assert.equal(finished.videoFile, null);
});

test('a queued job can be canceled before it starts', async () => {
  const store = new JobStore();
  await store.init();
  const provider = makeProvider();
  const manager = new JobManager(store, provider, {
    concurrency: 1,
    pollIntervalMs: 25,
    jobTimeoutMs: 3000,
  });

  const job = makeJob(store);
  const canceled = await manager.cancel(job.id);

  assert.equal(canceled.status, 'canceled');
  assert.equal(provider.calls.create, 0);
});
