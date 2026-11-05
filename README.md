# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/moonedition7-alt/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/moonedition7-alt/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/moonedition7-alt/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/moonedition7-alt/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/moonedition7-alt/PlayGround).
- 🛠️ [Check build runs](https://github.com/moonedition7-alt/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/moonedition7-alt/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/moonedition7-alt).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->

# OpenDub — local video dubbing MVP

The core product currently implements **Build Step 1: a Gradio dubbing MVP**. It accepts a video/audio file, transcribes speech, translates into one selected target language, creates speech, aligns it to the original segment slots, and exports MP4, MP3, SRT, and VTT. A separate local FastAPI job API is also available as an early backend step. The stack uses free/open-source software and does not require API keys or paid APIs.

The full multi-user Next.js dashboard and production backend described in the original product brief are not part of this prototype. There are no user accounts, durable jobs, or daily quota enforcement. Treat the current release as a local pipeline prototype, not a hosted service.

## Pipeline and limitations

- FFmpeg extracts audio and creates the final mux. Audio-only inputs receive a black still-video track in the MP4.
- faster-whisper provides speech transcription and timestamps. Whisper model weights download on first use.
- NLLB-200 distilled 600M translates each segment locally. Its model weights are several GB and need to download on first use; CPU translation can be slow.
- Microsoft Edge TTS is free to use through the `edge-tts` client, but it requires an internet connection and relies on Microsoft's service. It is not offline or guaranteed by an SLA.
- Demucs vocal/background separation is optional and disabled by default; enabling it downloads model weights and is slow on CPU. When enabled, the non-vocal stem is used as the music bed.
- There is no voice cloning in this MVP. No source-speaker diarization is performed; a target voice gender is selectable.
- Timing is fit to transcription slots. Very long translations are shortened and, as a last resort, trimmed to prevent overlap. Review the generated translation and subtitles before publishing.
- The UI limits media to 60 minutes. Model memory and runtime requirements vary significantly; on CPU, start with a short clip and Whisper `tiny` or `base`.

## Local setup (recommended)

Requirements: 64-bit Linux/macOS, CPython 3.11, FFmpeg (including `ffprobe`), and enough disk for model downloads. GPU is optional.

### 1. Install FFmpeg

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

macOS with Homebrew:

```bash
brew install ffmpeg
```

Confirm both `ffmpeg` and `ffprobe` are on `PATH`:

```bash
ffmpeg -version
ffprobe -version
```

### 2. Install and start

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env  # optional; values can also be exported in your shell
python app.py
```

Open <http://127.0.0.1:7860>. No `.env` file is needed for the default configuration. On Windows, install a CPython 3.11 environment and an FFmpeg build, then activate the venv and run `python app.py`.

### 3. Test the pipeline

1. Start with a short (10–30 second) video or audio clip with clear speech.
2. Upload it, leave source language on Auto-detect, choose a target, then click **Create dub**.
3. Wait for the first-run Whisper and NLLB model downloads; these are cached for later runs.
4. Check the MP4 and MP3, and open the SRT/VTT to verify transcript, translation, and timing.
5. Enable “Preserve background music” on a second run only after Demucs has installed successfully; CPU separation can take a while.

Generated results are stored under `outputs/<job-id>/`. Temporary working audio is removed when a job ends. Delete `outputs/` yourself when you no longer need the results.

### Useful settings

Copy `.env.example` to `.env` as a reference and export the values before launching (the app does not load dotenv automatically):

```bash
export WHISPER_DEVICE=cpu
export WHISPER_COMPUTE_TYPE=int8
export PORT=7860
python app.py
```

For CUDA, install a PyTorch build compatible with your CUDA runtime and set `WHISPER_DEVICE=cuda` and an appropriate compute type (for example `float16`). Translation uses the Transformers/PyTorch default device and can require substantial CPU/RAM. Choose `tiny` or `base` Whisper in the UI for quicker local tests.

## Local FastAPI job API (prototype)

A separate FastAPI service wraps the same dubbing pipeline with an in-process, single-worker queue. It accepts multipart uploads up to 2 GB, returns a job ID, exposes status/progress, and provides MP4/MP3/SRT/VTT download routes. Jobs and queue state are held in memory and disappear when the process restarts; outputs remain under `outputs/`.

Start it from the activated environment after installing requirements:

```bash
python api.py
```

Open <http://127.0.0.1:8000/docs> for the interactive API documentation. The main routes are `POST /api/jobs`, `GET /api/jobs/{job_id}`, and `GET /api/jobs/{job_id}/files/{video|audio|srt|vtt}`. The upload form fields use the same language, voice, glossary, speed, and Whisper choices as the Gradio app.

This is still a local prototype, **not a secure public multi-user service**: it has no authentication, durable job store, daily quota enforcement, or cross-process worker. Keep the default localhost binding. Before exposing it publicly, add authentication, request/rate limits, durable queue/storage, and deployment-specific upload limits.

## Docker

The image includes FFmpeg and installs the Python dependencies. Model weights are not baked into the image:

```bash
docker build -t opendub .
docker run --rm -p 7860:7860 \
  -v "$PWD/outputs:/app/outputs" \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  opendub
```

Then open <http://127.0.0.1:7860>. The first run downloads models into the mounted cache. Docker builds and model downloads are large.

## Free hosting notes

This pipeline is compute-heavy and uses large model downloads; free hosted tiers generally do not have enough persistent disk/RAM/CPU for reliable dubbing. A local machine is the most practical no-cost deployment.

- **Hugging Face Spaces:** create a Docker Space, use this repository's Dockerfile, and set the Space port to `7860`. Free CPU Spaces sleep and have limited resources/storage; a model load or long Demucs job may exceed those limits. Persistent storage/GPU can incur charges, so do not enable paid hardware if remaining strictly free.
- **Render free tier:** a Docker web service can be deployed from this repo, but free instances sleep and have limited memory, disk, execution time, and ephemeral storage. Long model inference is likely to be unreliable; generated files disappear on restart unless stored elsewhere. Do not use paid disks/instances if staying free.
- **Google Colab:** use a free notebook runtime, clone/copy this repository, install FFmpeg and requirements, then run `python app.py` bound to `0.0.0.0`. To expose it temporarily, use a Colab-provided share link or an open-source tunnel such as `cloudflared`; public tunneling has security/privacy implications. Free GPU availability and session lifetime are not guaranteed. Never expose private media in a public notebook/session.

This code does not configure or manage a hosted account, tunnel, or cloud resource. Review the relevant hosting and model licenses/terms before deploying.

## Structure

```text
.
├── app.py              # Gradio UI and end-to-end dubbing pipeline
├── api.py              # Local FastAPI job API
├── requirements.txt
├── Dockerfile
├── .env.example
└── outputs/            # Created automatically; completed downloads
```

## License and service notes

This project is a prototype. Check the licenses of the chosen models, dependencies, and the Edge TTS service for your use case. Media processing is local except Edge TTS speech generation. The app does not upload media to a third-party API by itself, but text supplied to Edge TTS is sent to Microsoft's service.
