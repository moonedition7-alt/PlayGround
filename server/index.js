import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { config, isProviderConfigured } from './config.js';
import { JobStore, TERMINAL_STATUSES, toPublicJob } from './store.js';
import { JobManager } from './jobs.js';

const app = express();
const store = new JobStore();
const manager = new JobManager(store);

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      const error = new Error('Please upload a JPG, PNG, or WebP image.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

const createLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => !isProviderConfigured(),
  message: {
    error: 'Too many generation requests. Please wait a few minutes and try again.',
  },
});

const getClientId = (req) => {
  const value = req.get('x-client-id') ?? '';
  return /^[A-Za-z0-9_-]{8,100}$/.test(value) ? value : null;
};

const imageExtension = (mime) => {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
};

const hasValidImageSignature = (buffer, mime) => {
  if (!buffer || buffer.length < 12) return false;
  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/webp') {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
};

const estimateSeconds = (duration, resolution) => {
  const factor = resolution === '1080p' ? 7 : resolution === '720p' ? 4.5 : 3;
  return Math.round(duration * factor + 12);
};

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: isProviderConfigured(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    configured: isProviderConfigured(),
    provider: 'Replicate',
    model: config.model,
    modelLabel: config.modelLabel,
    defaultResolution: config.resolution,
    limits: {
      promptMax: config.maxPromptLength,
      durations: [5, 10],
      aspectRatios: ['9:16', '16:9', '1:1'],
      resolutions: ['480p', '720p', '1080p'],
      maxImageMb: Math.round(config.maxImageBytes / (1024 * 1024)),
    },
    pricingPerSecond: { '480p': 0.018, '720p': 0.036, '1080p': 0.072 },
    setupUrl: config.setupUrl,
    pricingUrl: config.pricingUrl,
    docsUrl: config.docsUrl,
    freeTierNote:
      'Replicate offers free starter credit for new accounts. Video models are billed per second of generated video.',
  });
});

app.get('/api/jobs', (req, res) => {
  const clientId = getClientId(req);
  if (!clientId) {
    return res.status(400).json({ error: 'A valid x-client-id header is required.' });
  }
  const jobs = store.listForClient(clientId).map(toPublicJob);
  return res.json({ jobs });
});

app.post('/api/jobs', createLimiter, upload.single('image'), async (req, res) => {
  if (!isProviderConfigured()) {
    return res.status(503).json({
      error:
        'Video generation is not connected yet. Add REPLICATE_API_TOKEN to the server environment, then restart.',
      code: 'NOT_CONFIGURED',
      setupUrl: config.setupUrl,
    });
  }

  const clientId = getClientId(req);
  if (!clientId) {
    return res.status(400).json({ error: 'A valid x-client-id header is required.' });
  }

  const mode = req.body.mode === 'image' ? 'image' : 'text';
  const prompt = String(req.body.prompt ?? '').trim();
  const duration = Number.parseInt(req.body.duration, 10);
  const aspectRatio = String(req.body.aspectRatio ?? '16:9');
  const resolution = String(req.body.resolution ?? config.resolution);

  if (prompt.length < 3) {
    return res.status(400).json({ error: 'Please describe your video in at least 3 characters.' });
  }
  if (prompt.length > config.maxPromptLength) {
    return res.status(400).json({ error: `Prompts can be at most ${config.maxPromptLength} characters.` });
  }
  if (![5, 10].includes(duration)) {
    return res.status(400).json({ error: 'Duration must be 5 or 10 seconds.' });
  }
  if (!['9:16', '16:9', '1:1'].includes(aspectRatio)) {
    return res.status(400).json({ error: 'Aspect ratio must be 9:16, 16:9, or 1:1.' });
  }
  if (!['480p', '720p', '1080p'].includes(resolution)) {
    return res.status(400).json({ error: 'Resolution must be 480p, 720p, or 1080p.' });
  }

  const jobId = crypto.randomUUID();
  let sourceImage = null;
  let sourceMime = null;

  if (mode === 'image') {
    if (!req.file) {
      return res.status(400).json({ error: 'Choose a source image for image-to-video.' });
    }
    if (!hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ error: 'That image file appears to be invalid or corrupted.' });
    }
    sourceMime = req.file.mimetype;
    sourceImage = `${jobId}.${imageExtension(sourceMime)}`;
    await fsp.writeFile(path.join(config.uploadsDir, sourceImage), req.file.buffer);
  }

  const job = store.create({
    id: jobId,
    clientId,
    mode,
    prompt,
    duration,
    aspectRatio,
    resolution,
    provider: 'Replicate',
    model: config.model,
    sourceImage,
    sourceMime,
    estimatedSeconds: estimateSeconds(duration, resolution),
    etaSeconds: estimateSeconds(duration, resolution),
  });

  manager.enqueue(job.id);
  return res.status(202).json({ job: toPublicJob(job) });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = store.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Generation not found.' });
  return res.json({ job: toPublicJob(job) });
});

app.post('/api/jobs/:id/cancel', async (req, res) => {
  const clientId = getClientId(req);
  const job = store.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Generation not found.' });
  if (!clientId || job.clientId !== clientId) {
    return res.status(403).json({ error: 'You cannot cancel this generation.' });
  }
  if (TERMINAL_STATUSES.has(job.status)) {
    return res.status(409).json({ error: 'This generation has already finished.' });
  }
  const updated = await manager.cancel(job.id);
  return res.json({ job: toPublicJob(updated) });
});

app.delete('/api/jobs/:id', async (req, res) => {
  const clientId = getClientId(req);
  const job = store.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Generation not found.' });
  if (!clientId || job.clientId !== clientId) {
    return res.status(403).json({ error: 'You cannot delete this generation.' });
  }
  if (!TERMINAL_STATUSES.has(job.status)) {
    return res.status(409).json({ error: 'Cancel the generation before deleting it.' });
  }
  store.remove(job.id);
  return res.json({ ok: true });
});

app.get('/api/jobs/:id/video', (req, res) => {
  const job = store.get(req.params.id);
  if (!job?.videoFile) return res.status(404).json({ error: 'Video not found.' });
  const filePath = path.join(config.videosDir, path.basename(job.videoFile));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Video file no longer exists.' });
  const extension = path.extname(filePath).toLowerCase();
  const mime =
    job.videoMime ||
    (extension === '.webm' ? 'video/webm' : extension === '.mov' ? 'video/quicktime' : 'video/mp4');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(filePath);
});

app.get('/api/jobs/:id/download', (req, res) => {
  const job = store.get(req.params.id);
  if (!job?.videoFile) return res.status(404).json({ error: 'Video not ready.' });
  const filePath = path.join(config.videosDir, path.basename(job.videoFile));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Video file no longer exists.' });
  const extension = path.extname(filePath).toLowerCase() || '.mp4';
  return res.download(filePath, `info-ranga-ai-${job.id.slice(0, 8)}${extension}`);
});

app.get('/api/jobs/:id/source', (req, res) => {
  const job = store.get(req.params.id);
  if (!job?.sourceImage) return res.status(404).json({ error: 'Source image not found.' });
  const filePath = path.join(config.uploadsDir, path.basename(job.sourceImage));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Source image no longer exists.' });
  return res.sendFile(filePath);
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

if (config.isProd) {
  const distDir = path.join(config.rootDir, 'dist');
  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      return res.sendFile(indexHtml, (error) => {
        if (error) next(error);
      });
    });
  } else {
    console.warn('[server] dist/index.html not found. Run "npm run build" before starting in production.');
  }
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `The image is too large. Maximum size is ${Math.round(config.maxImageBytes / (1024 * 1024))} MB.`
        : 'The image upload could not be processed.';
    return res.status(400).json({ error: message });
  }
  if (error?.status && error.status < 500) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error('[server] Unhandled error:', error?.message ?? error);
  return res.status(500).json({ error: 'Unexpected server error. Please try again.' });
});

await store.init();
await store.pruneOldJobs();
await store.markInterruptedJobs();
manager.init();

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log('');
  console.log('  Info Ranga AI server');
  console.log(`  → http://localhost:${config.port}`);
  console.log(`  → Replicate: ${isProviderConfigured() ? 'connected' : 'NOT CONFIGURED (add REPLICATE_API_TOKEN)'}`);
  console.log(`  → Model: ${config.model}`);
  console.log(`  → Data: ${config.dataDir}`);
  console.log('');
});

const cleanupTimer = setInterval(() => {
  store.pruneOldJobs().catch((error) => console.warn('[store] Cleanup failed:', error.message));
}, 6 * 60 * 60 * 1000);
cleanupTimer.unref();

const shutdown = (signal) => {
  console.log(`\n[server] ${signal} received, shutting down.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
