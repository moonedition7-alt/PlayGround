# 🐼 PANDA AI STUDIO — Setup Guide

## Quick start (Demo Mode, free, no keys)

```bash
npm install
npm start
# open http://localhost:3000
```

Demo Mode works with **zero configuration**: generation shows a clearly-labeled
animated canvas preview (`DEMO PREVIEW — not a real AI video`). It never fakes an AI video.

## Enable REAL AI video generation (pick ONE)

Keys live **only in `.env` on the server** — `server.js` proxies requests, the browser never sees them.

### Option A — Replicate ⭐ (recommended)

1. Sign up at https://replicate.com (new accounts get free credit).
2. Copy a token from https://replicate.com/account/api-tokens
3. Configure:
   ```bash
   cp .env.example .env
   # edit .env:
   REPLICATE_API_TOKEN=r8_...
   REPLICATE_MODEL=minimax/video-01   # or stability-ai/stable-video-diffusion, luma/ray, etc.
   ```
4. `npm start` → pill in navbar flips from `DEMO MODE` to `LIVE AI`.

Tested input shape: `{ prompt, duration, aspect_ratio, first_frame_image? }`.
If your model uses different input keys, adjust `server.js` → `input: {...}` (~line 90).

### Option B — Hugging Face (free tier)

1. Free token: https://huggingface.co/settings/tokens
2. `.env`:
   ```
   HF_TOKEN=hf_...
   HF_MODEL=cerspense/zeroscope_v2_576w
   ```
3. Restart. Note: free Inference API may return `model loading` — wait ~60s and retry.
   Other video models: `damo-vilab/text-to-video-ms-1.7b`, `cerspense/zeroscope_v2_XL`.

### Option C — Custom gateway (Runway / Luma / Stability / Pika / your own)

Point to any HTTPS endpoint that accepts:

```json
POST { "prompt": "…", "style": "Cinematic", "aspectRatio": "16:9", "duration": 5, "image": "data:image/png;base64,…?" }
→ 200 { "videoUrl": "https://…/video.mp4" }
```

```env
CUSTOM_VIDEO_API_URL=https://your-gateway.example/generate
CUSTOM_VIDEO_API_KEY=optional-bearer
```

## Deploy

- **Render / Railway / Vercel / Docker**: set env vars in the dashboard (`REPLICATE_API_TOKEN`, …), start command `npm start`, port `$PORT`.
- Static-only hosts (GitHub Pages) → Demo Mode only (no server = no secret keys).

## API reference

| Method | Route | Description |
|---|---|---|
| GET | `/api/config` | `{ demoMode, providers }` — no secrets leaked |
| POST | `/api/generate` | `{ prompt, style, aspectRatio, duration, image? }` → `{ videoUrl }` or `{ videoBase64 }` or `503 { error:'DEMO_MODE' }` |
| GET | `/api/health` | `{ ok, demoMode }` |

## Honesty guarantee

- No key → HTTP `503 DEMO_MODE`, frontend shows animated mock **badged DEMO**, with a link to this guide.
- Real videos render with a green `✓ REAL AI VIDEO · provider` badge and enable Download MP4.
- History items are badged `REAL AI ✓` vs `DEMO — not AI`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Always Demo Mode | `.env` missing / server not restarted / var name typo |
| Replicate 401 | Invalid `REPLICATE_API_TOKEN` |
| Replicate 422 | Model name wrong or input keys mismatch — check model docs, edit `server.js` |
| HF "model loading" | Wait 60s, retry; try a smaller model |
| Download blocked | Host lacks CORS — player opens video in new tab instead |
