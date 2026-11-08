from __future__ import annotations

import os
import subprocess
import threading
from pathlib import Path
from typing import Callable

import numpy as np

_pipeline = None
_pipeline_key = None
_pipeline_lock = threading.Lock()


def _get_pipeline(mode: str):
    global _pipeline, _pipeline_key
    import torch
    from diffusers import CogVideoXImageToVideoPipeline, CogVideoXPipeline

    if not torch.cuda.is_available():
        raise RuntimeError("No CUDA GPU is available. Run this backend on a CUDA-enabled Colab, Kaggle, or GPU host.")
    model_id = os.getenv("FVS_I2V_MODEL", "THUDM/CogVideoX-5b-I2V") if mode == "image" else os.getenv("FVS_MODEL", "THUDM/CogVideoX-2b")
    key = (mode, model_id)
    with _pipeline_lock:
        if _pipeline is not None and _pipeline_key == key:
            return _pipeline
        if _pipeline is not None:
            del _pipeline
            torch.cuda.empty_cache()
        pipeline_class = CogVideoXImageToVideoPipeline if mode == "image" else CogVideoXPipeline
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        pipe = pipeline_class.from_pretrained(model_id, torch_dtype=dtype)
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
        if hasattr(pipe, "enable_vae_tiling"):
            pipe.enable_vae_tiling()
        if hasattr(pipe, "enable_model_cpu_offload"):
            pipe.enable_model_cpu_offload()
        else:
            pipe.to("cuda")
        _pipeline, _pipeline_key = pipe, key
    return _pipeline


def _dimensions(aspect_ratio: str, short_edge: int = 480) -> tuple[int, int]:
    if aspect_ratio == "9:16":
        return (short_edge, round(short_edge * 16 / 9 / 16) * 16)
    if aspect_ratio == "1:1":
        return (short_edge, short_edge)
    return (round(short_edge * 16 / 9 / 16) * 16, short_edge)


def render_video(job: dict, output_path: Path, loop, update: Callable[[str, int], None]) -> None:
    import torch
    from PIL import Image

    job_id = job["id"]
    mode = job["mode"]
    # CogVideoX has a native ~480p generation footprint; the requested 720p is
    # upscaled in the final MP4 to avoid requiring a >24 GB GPU.
    width, height = _dimensions(job["aspect_ratio"])
    frames_count = job["duration"] * 8 + 1
    steps = max(10, int(os.getenv("FVS_INFERENCE_STEPS", "30")))
    generator = torch.Generator(device="cuda")
    if job.get("seed") is not None:
        generator.manual_seed(int(job["seed"]))
    else:
        generator.seed()
    pipe = _get_pipeline(mode)

    def callback(_pipe, step_index, _timestep, callback_kwargs):
        loop.call_soon_threadsafe(update, job_id, int((step_index + 1) / steps * 90))
        return callback_kwargs

    args = {
        "prompt": job.get("prompt") or "",
        "negative_prompt": job.get("negative_prompt") or None,
        "num_frames": frames_count,
        "num_inference_steps": steps,
        "guidance_scale": 6.0,
        "generator": generator,
        "width": width,
        "height": height,
        "callback_on_step_end": callback,
        "callback_on_step_end_tensor_inputs": ["latents"],
    }
    if mode == "image":
        with Image.open(job["image_path"]) as source:
            source = source.convert("RGB")
            target_ratio = width / height
            source_ratio = source.width / source.height
            if source_ratio > target_ratio:
                crop_width = int(source.height * target_ratio)
                left = (source.width - crop_width) // 2
                source = source.crop((left, 0, left + crop_width, source.height))
            else:
                crop_height = int(source.width / target_ratio)
                top = (source.height - crop_height) // 2
                source = source.crop((0, top, source.width, top + crop_height))
            source = source.resize((width, height), Image.Resampling.LANCZOS)
            args["image"] = source
        # CogVideoX-I2V uses the source image as its visual anchor. The motion
        # strength UI is mapped to guidance so users can make motion more/less
        # assertive without altering the source image.
        args["guidance_scale"] = 3.0 + float(job.get("motion_strength", 0.55)) * 6.0
    try:
        result = pipe(**args)
    except TypeError as exc:
        if "callback_on_step_end_tensor_inputs" not in str(exc):
            raise
        args.pop("callback_on_step_end_tensor_inputs", None)
        result = pipe(**args)
    generated = result.frames[0]
    if hasattr(generated, "detach"):
        generated = generated.detach().cpu().numpy()
    frames = []
    for frame in generated:
        if isinstance(frame, Image.Image):
            arr = np.asarray(frame.convert("RGB"))
        else:
            arr = np.asarray(frame)
            if arr.dtype != np.uint8:
                if arr.min() < 0:
                    arr = (arr.clip(-1, 1) + 1) * 127.5
                elif arr.max() <= 1:
                    arr = arr * 255
                arr = arr.clip(0, 255).astype(np.uint8)
        frames.append(np.ascontiguousarray(arr[:, :, :3]))
    if not frames:
        raise RuntimeError("The model returned no frames. Please try another prompt.")
    _write_mp4(frames, output_path, job["resolution"])
    loop.call_soon_threadsafe(update, job_id, 98)
    if mode == "image":
        Path(job["image_path"]).unlink(missing_ok=True)


def _write_mp4(frames: list[np.ndarray], path: Path, resolution: str) -> None:
    import imageio_ffmpeg

    src_height, src_width = frames[0].shape[:2]
    if resolution == "720p":
        if src_width >= src_height:
            size = (1280, 720)
        elif src_height > src_width:
            size = (720, 1280)
        else:
            size = (720, 720)
    else:
        if src_width >= src_height:
            size = (854, 480) if src_width / src_height > 1.5 else (480, 480)
        else:
            size = (480, 854)
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg, "-y", "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{src_width}x{src_height}", "-r", "8", "-i", "-", "-an", "-vf",
               f"scale={size[0]}:{size[1]}:flags=lanczos,format=yuv420p", "-c:v", "libx264",
               "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", str(path)]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        assert process.stdin is not None
        for frame in frames:
            if frame.shape[1] != src_width or frame.shape[0] != src_height:
                from PIL import Image
                frame = np.asarray(Image.fromarray(frame).resize((src_width, src_height), Image.Resampling.LANCZOS))
            process.stdin.write(frame.tobytes())
        process.stdin.close()
        stderr = process.stderr.read() if process.stderr else b""
        code = process.wait()
        if code:
            raise RuntimeError(f"FFmpeg could not encode the video: {stderr.decode(errors='replace')[-350:]}")
    except Exception:
        process.kill()
        process.wait()
        raise
