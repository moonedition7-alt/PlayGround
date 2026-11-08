# FreeVideo Studio

A no-login video-generation studio with a React/Vite interface and a FastAPI worker powered by open-source Diffusers pipelines. Create short clips from text or animate an image, download MP4s, and keep a private history in the browser's IndexedDB.

> **Hardware note:** model inference requires a CUDA-capable NVIDIA GPU. There is no hosted GPU service bundled with this repository. A free GPU notebook can be used for testing, but free GPU availability, session length, and public access are not guaranteed. The browser app and API must both be reachable while a render is running.

## Features

- Text-to-video and image-to-video generation, with prompt enhancement and example prompts.
- Duration, aspect-ratio, resolution, seed, negative prompt, and image motion controls.
- Queue status, progress, and estimated wait time; one active job per browser session.
- MP4 output and local IndexedDB history. History is stored in the browser, not uploaded as an account library.
- Temporary server-side files are deleted after one hour.

## Requirements

- Node.js 20+ and npm.
- Python 3.10 or 3.11 recommended.
- NVIDIA GPU with a supported CUDA runtime and adequate VRAM. CogVideoX-2B is still a large model; image-to-video with the 5B model needs substantially more memory. Memory offload is enabled, but it can make generation slow and is not a guarantee that every GPU will fit.
- FFmpeg is installed through the `imageio-ffmpeg` Python package.

## Run locally

### 1. Install frontend packages

```bash
npm install
```

### 2. Install backend packages

Use a virtual environment. Install a PyTorch build compatible with the machine's CUDA driver first (choose the current command from [PyTorch's official installer](https://pytorch.org/get-started/locally/)), then install the app requirements:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\\Scripts\\activate
python -m pip install --upgrade pip
# Install the CUDA-enabled torch/torchvision build for your system from pytorch.org.
pip install -r requirements.txt
```

### 3. Start the API and frontend

In one terminal, from the repository root:

```bash
source .venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

In another terminal:

```bash
npm run dev
```

Open <http://localhost:5173>. The default API URL is `http://localhost:8000`. For a different API address, set `VITE_API_URL` before starting/building the frontend, for example:

```bash
VITE_API_URL=http://localhost:8000 npm run dev
```

The first render downloads the selected model from Hugging Face and can take a while. If access to a model requires accepting a license, accept it on Hugging Face and configure your Hugging Face token in the backend environment (`HF_TOKEN`). Keep tokens out of frontend variables and source control.

## Models and downloads

The backend downloads and caches model weights on first use with Diffusers; it does not need a separate manual download step. To pre-cache a model on the GPU host, set `FVS_MODEL` (or `FVS_I2V_MODEL`) and run `huggingface-cli download MODEL_ID` in the same environment. The default choices are:

- Text-to-video: `THUDM/CogVideoX-2b` (`FVS_MODEL`)
- Image-to-video: `THUDM/CogVideoX-5b-I2V` (`FVS_I2V_MODEL`)

Example configuration:

```bash
export FVS_MODEL=THUDM/CogVideoX-2b
export FVS_I2V_MODEL=THUDM/CogVideoX-5b-I2V
export FVS_INFERENCE_STEPS=30
export FVS_DATA_DIR=./backend/data
```

Model downloads are several gigabytes and require substantial disk space. Read each model card and license before use. Model names can be changed to compatible Diffusers CogVideoX model IDs; not every checkpoint supports both pipelines. This project uses the Diffusers pipeline API and enables VAE slicing/tiling and model CPU offload where available. Requested 720p is generated at the model's lower resolution and upscaled for MP4 output.

## Free deployment (best-effort, not always-on)

There is no universally available, always-on, public GPU host that guarantees free video generation. Free notebook GPU quotas and service policies change, and notebook runtimes disconnect. The following is a zero-cost *testing* setup when free GPU quota is available; it is not suitable for a dependable public service.

1. **Build the frontend:** run `npm ci && npm run build`. Host the generated `dist/` folder on a free static site provider (for example, GitHub Pages or Cloudflare Pages). Configure `VITE_API_URL` to the public HTTPS URL of the API **at build time**, then rebuild.
2. **Run the backend on a free GPU notebook:** use a provider such as Google Colab or Kaggle only if your account currently has GPU access. Start a CUDA-enabled Python runtime, clone this repository, install a matching CUDA PyTorch build and `requirements.txt`, and launch `uvicorn backend.main:app --host 0.0.0.0 --port 8000`.
3. **Expose the API temporarily:** use a provider-supported notebook proxy or tunnel that is allowed by that provider's terms. Set `FVS_CORS_ORIGINS` to the exact HTTPS frontend origin (comma-separated origins are supported), then restart the API. Do not expose a notebook, tunnel, or GPU server without understanding the provider's security rules.
4. **Keep the notebook alive while rendering:** model weights download on the first request and can consume many gigabytes. The API must remain running for job polling and video download. Restarting the runtime loses in-memory jobs and local output files.
5. **Expect the free tier to stop:** GPU quotas may be unavailable, jobs can take several minutes, and deployments can become unreachable when the runtime expires. For a permanent public service, use hardware and hosting you control and secure.

For local development, the default CORS origin is `http://localhost:5173`. Configure production origins through `FVS_CORS_ORIGINS`, for example `https://your-site.example`. The API does not use authentication; do not expose it to untrusted users or the public internet as-is. The session ID is an ownership/rate-limit identifier, not an authentication credential.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000` | API base URL used by the browser build |
| `FVS_MODEL` | `THUDM/CogVideoX-2b` | Text-to-video model ID |
| `FVS_I2V_MODEL` | `THUDM/CogVideoX-5b-I2V` | Image-to-video model ID |
| `FVS_INFERENCE_STEPS` | `30` | Diffusion steps; lower values are faster but may reduce quality |
| `FVS_DATA_DIR` | `backend/data` | Temporary uploads and generated videos |
| `FVS_MAX_QUEUE` | `3` | Maximum number of waiting jobs before rejecting new work |
| `FVS_CORS_ORIGINS` | local Vite origins | Comma-separated allowed browser origins |

## Checks

```bash
npm run build
python -m compileall backend
```

The project is provided as-is. Inference results, model availability, speed, and free GPU access depend on the selected model and host hardware.
