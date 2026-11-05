# Voxora Dubbing Studio

A free, source-available MVP for dubbing short audio and video clips. It combines a FastAPI/SQLite job API, a responsive Next.js dashboard, and a single-file Gradio interface. The processing pipeline uses FFmpeg, Faster-Whisper for transcription, NLLB for translation, and generated text-to-speech voices.

> **Important:** This is an experimental, single-user/local-first MVP—not a hardened public service. The dashboard's “Text to Speech”, “Speech to Text”, “Voice Library”, and “Voice Cloning” pages are placeholders; the supported workflow is audio/video dubbing. Voice cloning is not implemented. Generated speech uses Microsoft Edge TTS voices through the `edge-tts` package, so synthesis requires an internet connection and sends translated text to that service. Review the applicable service terms and privacy requirements before use.

## Features

- Upload audio or video, or record audio in a supported browser.
- Transcribe with word-level timing, translate to one or more target languages, and generate timed speech.
- Choose generated voice gender and speech speed; optionally provide a comma-separated glossary.
- Optionally preserve background music using Demucs or burn subtitles into the output video.
- Download MP4, MP3, SRT, and VTT outputs; edit the transcript/translation and regenerate downloadable captions.
- Track anonymous per-browser daily usage (30 minutes by default), view job progress, and delete completed/failed jobs.
- Responsive dashboard with light and dark themes, plus a simpler Gradio MVP.

Supported languages: Hindi, Kannada, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, Punjabi, Odia, Urdu, and English. Source language can also be auto-detected.

## Requirements

- Python 3.10+ (Python 3.11 is used in the Docker image).
- Node.js 20+ and npm for the dashboard.
- FFmpeg **and** FFprobe available on `PATH`.
- For AI processing, install `requirements-ai.txt`. PyTorch and model downloads can require substantial disk space and memory; CPU processing is supported but can be slow. The first run downloads the Whisper and NLLB models.
- Internet access is needed for initial model downloads and Edge TTS speech synthesis. Demucs is needed to preserve background music.

## Local setup

Run commands from the repository root. In one terminal, set up and run the API:

```bash
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-ai.txt
cp .env.example .env  # optional; defaults also work
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

On Windows, copy `.env.example` to `.env` manually if needed. Install FFmpeg separately and ensure `ffmpeg` and `ffprobe` are on `PATH`.

In another terminal, run the web app:

```bash
cd frontend
npm ci
# Optional: set NEXT_PUBLIC_API_URL in .env.local in this directory for a non-default API URL.
npm run dev
```

Open <http://localhost:3000>. The API health check is at <http://localhost:8000/api/health> and the interactive API docs are at <http://localhost:8000/docs>.

The lightweight API/Gradio dependencies can instead be installed with `pip install -r requirements.txt`. To run the single-file Gradio MVP, from the repository root:

```bash
python gradio_app.py
```

Then open <http://localhost:7860>. It uses the same AI pipeline and therefore still needs the AI dependencies, FFmpeg, model downloads, and internet for speech synthesis.

## Docker

The backend image installs FFmpeg and the optional AI stack. Persist its `/data` volume so uploaded files, generated outputs, and the SQLite database survive container replacement:

```bash
docker build -t voxora-api .
docker run --rm -p 8000:8000 \
  -e DUB_STORAGE=/data \
  -e DUB_DB=/data/dubbing.sqlite3 \
  -v voxora-data:/data \
  voxora-api
```

Build and run the frontend in a second terminal. The API URL is embedded at **build time** by Next.js; use an address reachable from the user's browser (not the Docker-internal service name):

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  -t voxora-web ./frontend
docker run --rm -p 3000:3000 voxora-web
```

Open <http://localhost:3000>. If the browser-facing API origin differs from `http://localhost:8000`, set `CORS_ORIGINS` on the API container to a comma-separated list containing the frontend origin, and rebuild the frontend with the correct `NEXT_PUBLIC_API_URL`. For example, on a LAN use the machine's reachable hostname/IP in both settings. Terminate TLS with a trusted reverse proxy before remote use; cookies are currently configured for local HTTP (`SameSite=Lax`, not `Secure`).

The checked-in `frontend/package-lock.json` is used by `npm ci` for reproducible local and Docker installs.

## Configuration

Copy `.env.example` and adjust values for your setup:

| Variable | Default | Description |
| --- | --- | --- |
| `DUB_STORAGE` | `backend/storage` when run from the repo root | Directory for uploads, outputs, and temporary job data. |
| `DUB_DB` | `<DUB_STORAGE>/dubbing.sqlite3` | SQLite database path. |
| `DAILY_MINUTES` | `30` | Anonymous user's daily upload quota in minutes. |
| `DUB_WORKERS` | `1` | Background job worker count; larger values use more CPU/RAM. |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated allowed browser origins. |
| `WHISPER_MODEL` | `small` | Faster-Whisper model name. Larger models need more memory and run slower. |
| `WHISPER_DEVICE` | `cpu` | Whisper device, e.g. `cpu` or a configured GPU device. |
| `WHISPER_COMPUTE_TYPE` | `int8` on CPU | Faster-Whisper compute type; choose a compatible value for the device. |
| `NLLB_MODEL` | `facebook/nllb-200-distilled-600M` | Hugging Face translation model identifier/path. |
| `DEMUCS_MODEL` | `htdemucs` | Demucs model used for vocal/background separation. |

AI model weights are downloaded/cached by their libraries; make sure the runtime user can write to the relevant model cache. Container storage `/data` is separate from those caches unless configured otherwise.

## Limits and behavior

- Upload limit: 2 GB. Media duration limit: 60 minutes. The default daily quota is 30 minutes per anonymous browser identity and resets at local midnight.
- Job identity is an anonymous cookie, **not an account or authentication system**. Clearing/changing the cookie loses access to that browser's job history; this must not be treated as secure access control for a multi-user/public deployment.
- Jobs run in a thread pool in the API process. They are not distributed or persisted as a durable queue; restarting the process interrupts active work. Use one API process with SQLite for this MVP.
- Enabling music preservation requires Demucs; the backend fails the job with an installation hint if unavailable.
- Audio and video output is produced for each target language. Music is preserved only when requested. Burning subtitles applies to video output.
- Editing transcript text updates the stored transcript and downloadable SRT/VTT files. It does **not** regenerate dubbed audio or subtitles already burned into a video.
- Voice-cloning controls only collect a consent acknowledgement for the UI/API; cloning is not implemented and no cloned voice is generated.
- Translation and voice synthesis quality/timing can vary. Review outputs before publishing; do not assume generated content is a faithful or legally cleared translation.

## Privacy and rights

Uploads and results are stored on the configured backend storage and remain until the job is deleted or the storage is removed. The app does not currently have automated retention cleanup, user accounts, encryption-at-rest management, or production-grade authentication. Use only media and voices you have rights to use. Avoid uploading sensitive content to a deployment you do not control, and review the policies of all model and speech services used.

## License

No project license file is included yet. Add a license before redistributing this repository or presenting the project as licensed open source. Each model, dependency, voice, and external speech service may have separate terms; verify them independently.
