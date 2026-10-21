import type { AppConfig, GenerationRequest, Job } from './types';

const CLIENT_KEY = 'info-ranga-client-id';

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function getClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,100}$/.test(existing)) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('x-client-id', getClientId());
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const data = payload as { error?: string; code?: string } | null;
    throw new ApiError(
      data?.error ?? `Request failed with status ${response.status}.`,
      response.status,
      data?.code,
    );
  }

  return payload as T;
}

export const api = {
  getConfig: () => request<AppConfig>('/api/config'),
  listJobs: () => request<{ jobs: Job[] }>('/api/jobs'),
  getJob: (id: string) => request<{ job: Job }>(`/api/jobs/${id}`),
  createJob: (input: GenerationRequest) => {
    const body = new FormData();
    body.set('mode', input.mode);
    body.set('prompt', input.prompt);
    body.set('duration', String(input.duration));
    body.set('aspectRatio', input.aspectRatio);
    body.set('resolution', input.resolution);
    if (input.image) body.set('image', input.image);
    return request<{ job: Job }>('/api/jobs', { method: 'POST', body });
  },
  cancelJob: (id: string) => request<{ job: Job }>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  deleteJob: (id: string) => request<{ ok: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' }),
};
