---
title: OpenDub
emoji: 🎙️
colorFrom: indigo
colorTo: purple
sdk: gradio
app_file: app.py
pinned: false
---

# OpenDub — free AI video dubbing

OpenDub is a small, free-to-run dubbing app with two separate parts:

- **Gradio backend (`app.py`)** transcribes extracted audio, translates it, creates speech, and returns MP3, SRT, and TXT files.
- **Browser studio (`dist/index.html`)** extracts audio with ffmpeg.wasm, keeps the original media on your device, then muxes the dubbed MP3 into an MP4 locally while copying the source video stream without re-encoding.

The pipeline uses faster-whisper `small`, NLLB-200 distilled 600M, and Edge TTS. No paid API keys are required. Edge TTS does require internet and sends translated text to Microsoft's service. The supported target languages are Hindi, Kannada, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, and English.

## Five-step quick start (Colab backend)

1. **Open the notebook.** Open [`opendub_colab.ipynb`](https://colab.research.google.com/github/moonedition7-alt/PlayGround/blob/main/opendub_colab.ipynb) in Google Colab. In **Runtime → Change runtime type**, select a T4 GPU when one is available.
2. **Launch the backend.** Run the notebook cells from top to bottom. It installs FFmpeg and the Python dependencies, configures faster-whisper for GPU float16 (CPU int8 fallback), and launches Gradio with `share=True`. The first job downloads model weights and caches them for the session.
3. **Copy the backend URL.** Copy the public `https://....gradio.live` URL printed by the last cell. The URL is temporary and accessible to anyone who has it; do not use a shared session for private media.
4. **Open the browser studio.** Serve `dist/` locally or host it on a static web host. For local use, clone this repository on your computer and run:
   ```bash
   python3 -m http.server 3000 --directory dist
   ```
   Then open <http://localhost:3000>. The studio loads `@gradio/client` and ffmpeg.wasm from public CDNs; no frontend build step is needed.
5. **Connect and dub a test clip.** Paste the Gradio URL into **Gradio backend URL**, click **Test connection**, choose a clear 10–30 second clip, select languages and voice options, then click **Create dub**. Download the MP4, MP3, SRT, and translated TXT when complete.

The browser uploads only an extracted mono WAV to Gradio. The source video/audio stays in the browser and is used for local MP4 muxing. Files over 200 MB and clips longer than 10 minutes are rejected. The MP4 video stream is copied without re-encoding; audio-only inputs produce an MP4 container with dubbed audio but no video track.

## Local backend

Requirements: CPython 3.11, FFmpeg (including `ffprobe`), internet access for model downloads and Edge TTS, and several GB of disk/cache space. A GPU is recommended; CPU fallback is supported but can be slow.

```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y ffmpeg libsndfile1

python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
HOST=127.0.0.1 python app.py
```

Open <http://127.0.0.1:7860>, then use that URL as the backend URL in the studio. To make the local backend reachable from another machine, configure a trusted network or tunnel; do not expose this unauthenticated prototype publicly. To create a temporary Gradio share link, launch with `SHARE=true python app.py`.

For CUDA, install a PyTorch build compatible with your CUDA runtime. The app selects CUDA and float16 automatically when available. `WHISPER_DEVICE` and `WHISPER_COMPUTE_TYPE` can override the faster-whisper device and compute type. Models are cached by their respective libraries under the normal Hugging Face cache location.

## Hugging Face Spaces

This repository includes Gradio Space metadata in the README front matter, with `app.py` as the entry point. The Space installs Python dependencies from `requirements.txt` and system packages from `packages.txt` (`ffmpeg` and `libsndfile1`). A free CPU Space may not have enough memory or compute for model downloads and inference; GPU access is recommended. Once the Space is running, paste its URL into the browser studio and click **Test connection**.

The app has no user accounts, authentication, durable job isolation, or quotas. A public Space or Gradio share link can be used by anyone who can reach it. Review hosting, model, dependency, and Edge TTS terms for your use case.

## Processing details and limitations

- faster-whisper `small` uses beam size 1 and voice activity detection. Transcription and translation models are cached after loading.
- NLLB-200 distilled 600M translates in batches of 16 with two beams; GPU inference uses fp16.
- Edge TTS segment synthesis runs concurrently with a maximum of eight requests.
- FFmpeg `atempo` fits voice segments to their subtitle timing slots, capped at 1.6×; pydub places the clips and optionally overlays lowered original audio.
- The original audio option lowers and mixes the full source audio track, so original speech may remain audible. It is not source separation.
- There is no voice cloning or speaker diarization. Select a synthesized voice gender in the browser.
- Temporary work files are removed when a backend job ends. Completed MP3, SRT, and TXT files remain under `outputs/` on the backend; MP4 is assembled and downloaded by the browser.
- Browser extraction and MP4 muxing require a modern browser and network access to the ffmpeg.wasm CDN. The initial download of the FFmpeg WebAssembly core may take a little time.

## Optional Docker backend

```bash
docker build -t opendub .
docker run --rm -p 7860:7860 \
  -v "$PWD/outputs:/app/outputs" \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  opendub
```

The image includes FFmpeg. Models are downloaded on first use and are not baked into the image.

## Project files

```text
app.py                 Gradio audio-only inference backend
dist/index.html        Browser studio and local media processing
requirements.txt       Python backend dependencies
packages.txt           Hugging Face Spaces system dependencies
opendub_colab.ipynb    Colab launcher (Gradio share link)
Dockerfile             Optional backend container
```

This is a prototype, not a hosted commercial service. Free GPUs and session availability are not guaranteed. Check the licenses and terms of all models and services before use.
