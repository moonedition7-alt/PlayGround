import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';

const API_BASE = 'https://api.replicate.com/v1';

export class ProviderError extends Error {
  constructor(message, { status = 0, detail = '' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.detail = detail;
  }
}

let modelVersionCache = { model: null, version: null, fetchedAt: 0 };

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${config.replicateToken}`,
    ...extra,
  };
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: authHeaders({
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    }),
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const rawDetail = data?.detail ?? data?.title ?? data?.error ?? text;
    const detail =
      typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail ?? 'Unknown error');
    throw new ProviderError(detail.slice(0, 500) || `Replicate returned HTTP ${response.status}`, {
      status: response.status,
      detail: detail.slice(0, 1000),
    });
  }

  return data;
}

async function resolveModelVersion() {
  if (config.modelVersion) return config.modelVersion;

  const cacheFresh = Date.now() - modelVersionCache.fetchedAt < 10 * 60 * 1000;
  if (cacheFresh && modelVersionCache.model === config.model) {
    return modelVersionCache.version;
  }

  try {
    const model = await apiFetch(`${API_BASE}/models/${config.model}`);
    const version = model?.latest_version?.id ?? null;
    modelVersionCache = { model: config.model, version, fetchedAt: Date.now() };
    return version;
  } catch (error) {
    if (error instanceof ProviderError && error.status === 404) {
      throw new ProviderError(
        `The model "${config.model}" was not found on Replicate. Check REPLICATE_MODEL.`,
        { status: 404, detail: error.detail },
      );
    }
    throw error;
  }
}

function normalizePrediction(prediction) {
  if (!prediction || typeof prediction !== 'object') {
    throw new ProviderError('Replicate returned an unexpected empty response.');
  }
  return prediction;
}

export async function createPrediction({
  prompt,
  duration,
  aspectRatio,
  resolution,
  imageDataUrl,
}) {
  const version = await resolveModelVersion();
  const input = {
    prompt,
    duration: Number(duration),
    resolution,
    fps: 24,
    camera_fixed: false,
  };

  if (imageDataUrl) {
    input.image = imageDataUrl;
  } else {
    input.aspect_ratio = aspectRatio;
  }

  const body = version
    ? { version, input }
    : { version: config.model, input };

  const prediction = await apiFetch(`${API_BASE}/predictions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return normalizePrediction(prediction);
}

export async function getPrediction(predictionId) {
  const prediction = await apiFetch(`${API_BASE}/predictions/${encodeURIComponent(predictionId)}`);
  return normalizePrediction(prediction);
}

export async function cancelPrediction(predictionId) {
  try {
    await apiFetch(`${API_BASE}/predictions/${encodeURIComponent(predictionId)}/cancel`, {
      method: 'POST',
    });
  } catch (error) {
    if (error instanceof ProviderError && [404, 409, 422].includes(error.status)) return;
    throw error;
  }
}

export function extractOutputUrl(prediction) {
  let output = prediction?.output;

  if (Array.isArray(output)) {
    output = output.find((item) => typeof item === 'string') ?? output[0];
  }
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    output = output.video ?? output.url ?? output.output ?? output.file ?? null;
  }
  if (typeof output !== 'string') return null;

  try {
    const parsed = new URL(output);
    if (parsed.protocol !== 'https:') return null;
    if (!parsed.hostname.endsWith('replicate.delivery')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function downloadOutput(url, destination) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('replicate.delivery')) {
    throw new ProviderError('Replicate returned an untrusted output URL.');
  }

  const response = await fetch(parsed, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(`Could not download the generated video (HTTP ${response.status}).`, {
      status: response.status,
    });
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !contentType.startsWith('video/') && !contentType.includes('octet-stream')) {
    throw new ProviderError(`Unexpected file type from the video provider: ${contentType}`);
  }

  const temp = `${destination}.part`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp));

  const stat = await fs.promises.stat(temp);
  if (stat.size < 1024) {
    await fs.promises.rm(temp, { force: true });
    throw new ProviderError('The generated video file was empty or incomplete.');
  }

  const extension = contentType.includes('webm')
    ? 'webm'
    : contentType.includes('quicktime')
      ? 'mov'
      : 'mp4';
  const finalPath = `${destination}.${extension}`;
  await fs.promises.rename(temp, finalPath);

  return {
    path: finalPath,
    size: stat.size,
    mime: contentType || 'video/mp4',
  };
}

export function parseProgressFromLogs(logs) {
  if (typeof logs !== 'string' || logs.length === 0) return null;
  const matches = [...logs.matchAll(/(\d{1,3})\s*%/g)];
  if (matches.length === 0) return null;
  const value = Number.parseInt(matches[matches.length - 1][1], 10);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

export function describeError(error) {
  if (error?.name === 'TimeoutError' || /timed? ?out/i.test(error?.message ?? '')) {
    return 'The request to Replicate timed out. Please try again.';
  }

  if (error instanceof ProviderError) {
    switch (error.status) {
      case 401:
      case 403:
        return 'Replicate rejected the API token. Check REPLICATE_API_TOKEN and restart the server.';
      case 402:
        return 'Replicate billing is not active. Add credit or use an account with available credit.';
      case 404:
        return error.detail || 'The configured video model could not be found.';
      case 429:
        return 'Replicate rate limit reached. Wait a moment and try again.';
      case 422:
        return `Replicate could not accept these inputs. ${error.detail}`.trim();
      default:
        return `Replicate error${error.status ? ` (${error.status})` : ''}: ${error.detail || error.message}`;
    }
  }

  if (error instanceof Error) {
    const message = error.message.slice(0, 500);
    if (/ENOENT|EACCES|EPERM|server[\\/]/i.test(message)) {
      return 'A server-side file required for this render is missing. Please try again.';
    }
    return message;
  }
  return 'Video generation failed for an unknown reason.';
}
