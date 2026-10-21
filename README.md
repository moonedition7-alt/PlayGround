# Info Ranga AI

A complete, production-minded AI video studio. Turn a text prompt or a source image into a real
downloadable video, with live job progress, a private per-browser history and a mobile-first dark
dashboard.

The interface is free to use. Generation is performed by a **real Replicate model**
(`bytedance/seedance-1-lite` by default) using a server-side API token. There are **no demo clips,
stock videos or simulated results** anywhere in the app. If no token is configured, generation is
disabled and the Setup section explains how to connect one.

![Stack](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?style=flat-square)
![Express](https://img.shields.io/badge/Node.js-Express_5-3c873a?style=flat-square)
![Provider](https://img.shields.io/badge/Replicate-Seedance-ff7a18?style=flat-square)

## Features

- **Text-to-video** and **image-to-video** generation.
- Prompt editor with copy button, character counter, prompt ideas and a surprise-me helper.
- **5s and 10s** durations.
- **9:16, 16:9 and 1:1** aspect ratios for text-to-video (image-to-video follows the source framing).
- 480p / 720p / 1080p resolution selector with an approximate cost estimate.
- Asynchronous server-side job queue, provider polling, progress estimates and readable errors.
- Live preview with stage-by-stage progress and cancel support.
- Downloadable MP4 files, served by the app after the provider finishes.
- Per-browser generation history with copy, download, preview, retry and delete actions.
- Responsive premium dark UI with orange/purple gradients, reduced-motion support and mobile
  bottom navigation.
- **No API key in the frontend.** The browser only talks to this app's Express API.

## Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Frontend   | React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide    |
| Backend    | Node.js 20.19+, Express 5, Multer, Helmet, rate limiting |
| AI provider| Replicate HTTP API (default: `bytedance/seedance-1-lite`) |
| Storage    | Local JSON metadata + MP4 files on disk (configurable)  |

## How it works

```text
Browser (React)
   │  POST /api/jobs  (multipart, x-client-id)
   ▼
Express API ── validation / rate limit / image checks
   │
   ├── job persisted to server/data/jobs.json
   ├── queue (JOB_CONCURRENCY, default 2)
   ▼
Replicate API ── create prediction, poll status
   │
   ├── progress + stage written to job store
   └── on success: output downloaded to server/data/videos/<job>.mp4
   ▲
   │  GET /api/jobs/:id (poll)
Browser ── preview / history / download
```

Job lifecycle: `queued → starting → processing → downloading → succeeded` or
`failed` / `canceled`. Jobs that are interrupted by a server restart are resumed from their
Replicate prediction when possible.

Replicate output URLs expire, so the server immediately downloads each completed video and serves
it from its own storage.

## Requirements

- Node.js **20.19+** (Node 22/24 recommended).
- npm 10+.
- A [Replicate](https://replicate.com) account and API token for real generation.
  New accounts may include free starter credit; video models are billed per second by Replicate.

## Quick start

```bash
git clone <your-repository-url>
cd PlayGround
npm install
cp .env.example .env
```

Open `.env`, add your token, and save:

```dotenv
REPLICATE_API_TOKEN=r8_your_real_token_here
```

Start the development servers:

```bash
npm run dev
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:3001>
- Health check: <http://localhost:3001/api/health>

Vite proxies `/api` to Express. The header should show **API connected** once the token is loaded.

### Run a production build locally

```bash
npm run build
npm start
# open http://localhost:3001
```

`npm start` sets `NODE_ENV=production`; Express serves the compiled `dist/` folder and the API from
the same origin.

### Useful commands

```bash
npm run dev        # Express + Vite watch mode
npm run build      # Type-check-free Vite production build
npm run typecheck  # TypeScript checks
npm test           # Server job pipeline tests (stubbed provider, no network)
npm start          # Production server (serves dist + API)
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `REPLICATE_API_TOKEN` | Yes for generation | — | Server-side Replicate token. Never expose to the browser. |
| `REPLICATE_MODEL` | No | `bytedance/seedance-1-lite` | Model slug. It must accept the inputs this app sends. |
| `REPLICATE_MODEL_VERSION` | No | latest | Pin a version hash for stable production behavior. |
| `REPLICATE_RESOLUTION` | No | `720p` | Default resolution if a request omits one. |
| `PORT` | No | `3001` | Express port. |
| `DATA_DIR` | No | `./server/data` | Persistent directory for jobs, uploads and MP4s. |
| `JOB_CONCURRENCY` | No | `2` | Number of simultaneous provider jobs (1–4). |
| `POLL_INTERVAL_MS` | No | `3000` | Replicate polling interval (1500–15000ms). |
| `JOB_TIMEOUT_MS` | No | `900000` | Max job runtime (15 minutes). |
| `RETENTION_DAYS` | No | `7` | Automatic cleanup of terminal jobs and their files. |
| `TRUST_PROXY` | No | — | Set to `1` behind a trusted reverse proxy so rate limiting uses real IPs. |

> **Never** prefix the token with `VITE_`. Anything starting with `VITE_` is bundled into the
> browser. This app only reads the token inside `server/`.

## Free mode and costs

- The website interface is free to use and runs fully without an API token — generation stays
  disabled until you connect one.
- Replicate provides starter credit for new accounts in many regions. Exact availability and
  pricing change; check [Replicate pricing](https://replicate.com/pricing).
- Seedance 1.0 Lite is billed per second of generated output. The UI shows an approximate price
  based on these published rates:

| Resolution | Approximate rate | 5 seconds | 10 seconds |
| --- | --- | --- | --- |
| 480p | $0.018/s | ~$0.09 | ~$0.18 |
| 720p | $0.036/s | ~$0.18 | ~$0.36 |
| 1080p | $0.072/s | ~$0.36 | ~$0.72 |

These are estimates, not billing guarantees. Replicate charges your account directly.

## API

All generation endpoints use a browser-generated `x-client-id` header. It scopes history and
destructive actions; it is not authentication.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health and configuration status. |
| `GET` | `/api/config` | Public configuration, limits and pricing hints. No secrets. |
| `GET` | `/api/jobs` | Jobs for the current `x-client-id`. |
| `POST` | `/api/jobs` | Multipart form: `mode`, `prompt`, `duration`, `aspectRatio`, `resolution`, optional `image`. Returns `202` with a job. |
| `GET` | `/api/jobs/:id` | Current job state and progress. |
| `POST` | `/api/jobs/:id/cancel` | Cancel a queued/running job. Requires matching client ID. |
| `DELETE` | `/api/jobs/:id` | Delete a terminal job and its files. Requires matching client ID. |
| `GET` | `/api/jobs/:id/video` | Stream the stored MP4 (used by the preview). |
| `GET` | `/api/jobs/:id/download` | Download the MP4 as an attachment. |
| `GET` | `/api/jobs/:id/source` | Source image for image-to-video jobs. |

Example:

```bash
curl -X POST http://localhost:3001/api/jobs \
  -H 'x-client-id: my-browser-client-id' \
  -F 'mode=text' \
  -F 'prompt=A slow cinematic dolly through a rainy neon market' \
  -F 'duration=10' \
  -F 'aspectRatio=9:16' \
  -F 'resolution=720p'
```

Validation: prompt 3–1500 characters, duration 5 or 10, ratio `9:16|16:9|1:1`, resolution
`480p|720p|1080p`, images JPG/PNG/WebP up to 4 MB (the browser optimizes images to roughly
180 KB before upload). Creation is rate limited to 20 requests per 10 minutes per IP.

## Deployment

The app is a single Node process that serves both the SPA and the API. You need a host with a
**persistent filesystem** for history and video files.

### Option 1 — Render (blueprint included)

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint** and select the repo. `render.yaml` creates the web service.
3. Set `REPLICATE_API_TOKEN` in the dashboard when prompted.
4. The blueprint mounts a 1 GB disk at `/var/data` and sets `DATA_DIR=/var/data`.

If you use Render's free plan, remove the `disk` block and the `DATA_DIR` variable. Files will be
ephemeral and history may disappear on restarts/redeploys.

### Option 2 — Railway

1. Create a project from the repository.
2. Build command: `npm ci && npm run build`.
3. Start command: `npm start`.
4. Add `REPLICATE_API_TOKEN` plus `NODE_ENV=production`.
5. Add a volume mounted at `/data` and set `DATA_DIR=/data`.
6. Add `TRUST_PROXY=1` if Railway is proxying requests.

### Option 3 — Docker / Fly.io / any VPS

```bash
docker build -t info-ranga-ai .
docker run -d --name info-ranga-ai \
  -p 3001:3001 \
  --env-file .env \
  -e NODE_ENV=production \
  -v info-ranga-data:/data \
  info-ranga-ai
```

The image sets `DATA_DIR=/data` and exposes port `3001`. For Fly.io, allocate a volume and mount it
at `/data`, then set the same environment variables.

### Option 4 — VPS with nginx

Run the app under systemd/pm2, then proxy requests:

```nginx
server {
    listen 80;
    server_name video.example.com;
    client_max_body_size 8m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `TRUST_PROXY=1` in the app environment, add HTTPS with Certbot, and back up `DATA_DIR`.

> Do not deploy this to a purely serverless filesystem (for example Vercel functions) unless you
> replace local file storage with object storage and a database. `server/data` must persist.

### Post-deploy checklist

- `GET /api/health` returns `{"ok":true,"configured":true}`.
- Header status reads **API connected**.
- A 5s 480p test render succeeds and is downloadable.
- A persistent volume is mounted at `DATA_DIR`.
- `TRUST_PROXY=1` is set when behind a reverse proxy.
- The token is stored only in the host's secret/environment settings.

## Security notes

- **Server-side keys only.** `REPLICATE_API_TOKEN` is read by Express and never returned by
  `/api/config`; the frontend bundle contains no token.
- `.env` is gitignored. Rotate any token that has been exposed.
- Uploads are size limited, MIME checked and signature checked before use.
- Provider errors are normalized and truncated; internal paths are not returned to clients.
- Generated files are served by unguessable UUIDs. This is not an authentication system.
- History and deletion are scoped by the browser's `x-client-id` value. Clearing browser storage
  makes previous history inaccessible (the files remain on disk until retention cleanup).
- For a public multi-user deployment, add real accounts, database-backed ownership, object storage
  and per-user quotas.

## Project structure

```text
.
├── server/
│   ├── index.js                 Express API, routes, uploads, static serving
│   ├── config.js                Environment + limits
│   ├── jobs.js                  Async queue, polling, progress, download
│   ├── store.js                 JSON-backed job store + public serializer
│   ├── providers/replicate.js   Real Replicate HTTP client
│   ├── test/jobs.test.js        Pipeline tests with a stubbed provider
│   └── data/                    Runtime jobs.json, uploads, videos (gitignored)
├── src/
│   ├── App.tsx                  Studio state, polling, toasts, layout
│   ├── components/              Header, Hero, Generator, Preview, History, Setup…
│   ├── lib/                     API client, types, image optimization, helpers
│   └── index.css                Tailwind theme, gradients, animations
├── public/favicon.svg
├── Dockerfile
├── render.yaml
├── .env.example
└── README.md
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Header says **Setup required** | Add `REPLICATE_API_TOKEN` to `.env`, then restart the server. |
| `503 NOT_CONFIGURED` from POST | The server started without a token. Restart after editing `.env`. |
| Replicate 401/403 | Token is invalid or revoked. Create a new token. |
| Replicate 402 | The account needs credit/billing enabled. |
| Replicate 429 | Provider rate limit; wait and retry. |
| Model not found | Check `REPLICATE_MODEL`; the default is `bytedance/seedance-1-lite`. |
| Generation is slow | Video models commonly take 30–120 seconds; queued jobs run two at a time. |
| History disappeared | The deployment likely has an ephemeral filesystem. Mount a persistent disk and set `DATA_DIR`. |
| Image-to-video ignores ratio | Expected: that model follows the source image framing. |
| Videos missing after a while | Default retention is 7 days; increase `RETENTION_DAYS`. |

## Limitations and next steps

- The default model is Seedance 1.0 Lite. You can change `REPLICATE_MODEL`, but the replacement
  must accept `prompt`, `duration`, `aspect_ratio`, `resolution`, `fps`, `camera_fixed` and,
  for image mode, `image`.
- The provider free/trial credit is limited; heavy use requires billing on Replicate.
- No audio tracks are generated by the default model.
- No user accounts, database, or object storage yet. Those are the natural next steps for a
  large public deployment.
- The interface is intentionally explicit about state: it never fills the preview with a
  placeholder presented as a generated result.
