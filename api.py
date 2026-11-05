"""Local asynchronous job API for the OpenDub pipeline.

This is an in-process prototype: job state is held in memory and is lost on
restart. Bind to localhost unless an authenticated deployment layer is added.
"""
from __future__ import annotations

import os
import shutil
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app import LANGUAGES, dub_media

MAX_UPLOAD_BYTES = 2 * 1024**3
MAX_QUEUED_JOBS = 8

api = FastAPI(title="OpenDub API", version="0.2.0", description="Local video/audio dubbing jobs")
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="opendub")
_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _snapshot(job_id: str) -> dict[str, Any]:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        data = {key: value for key, value in job.items() if key != "files"}
        data["files"] = {
            key: f"/api/jobs/{job_id}/files/{key}"
            for key, path in job.get("files", {}).items()
            if Path(path).is_file()
        }
        return data


def _process(job_id: str, upload_path: Path, params: dict[str, Any]) -> None:
    try:
        with _lock:
            _jobs[job_id]["status"] = "running"
            _jobs[job_id]["progress"] = "Starting dubbing job"
        for update in dub_media(
            str(upload_path), params["target_language"], params["source_language"],
            params["speaker_gender"], params["speech_speed"], params["keep_music"],
            params["glossary_text"], params["whisper_model"],
        ):
            message, video, audio, srt, vtt, transcript = update
            with _lock:
                job = _jobs[job_id]
                job["progress"] = message
                if message.startswith("❌"):
                    job["status"] = "failed"
                    job["error"] = message
                elif video and audio and srt and vtt:
                    job["status"] = "completed"
                    job["transcript"] = transcript
                    job["files"] = {
                        "video": str(video), "audio": str(audio),
                        "srt": str(srt), "vtt": str(vtt),
                    }
    except Exception as exc:
        with _lock:
            if job_id in _jobs:
                _jobs[job_id]["status"] = "failed"
                _jobs[job_id]["error"] = str(exc)
                _jobs[job_id]["progress"] = "Dubbing failed"
    finally:
        shutil.rmtree(upload_path.parent, ignore_errors=True)


@api.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api.post("/api/jobs", status_code=202)
async def create_job(
    file: UploadFile = File(...),
    target_language: str = Form("Hindi"),
    source_language: str = Form("Auto-detect"),
    speaker_gender: str = Form("Female"),
    speech_speed: int = Form(0),
    keep_music: bool = Form(False),
    glossary_text: str = Form(""),
    whisper_model: str = Form("small"),
) -> dict[str, Any]:
    if target_language not in LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported target language")
    allowed_sources = {"Auto-detect", "English", *LANGUAGES.keys()}
    if source_language not in allowed_sources:
        raise HTTPException(status_code=422, detail="Unsupported source language")
    if speaker_gender not in {"Female", "Male"}:
        raise HTTPException(status_code=422, detail="speaker_gender must be Female or Male")
    if speech_speed < -20 or speech_speed > 20 or speech_speed % 5:
        raise HTTPException(status_code=422, detail="speech_speed must be -20..20 in steps of 5")
    if whisper_model not in {"tiny", "base", "small", "medium", "large-v3"}:
        raise HTTPException(status_code=422, detail="Unsupported Whisper model")
    if not file.filename:
        raise HTTPException(status_code=422, detail="Uploaded file must have a filename")

    job_id = uuid.uuid4().hex
    temp_dir = Path(tempfile.mkdtemp(prefix=f"opendub-{job_id}-"))
    safe_name = Path(file.filename.replace("\\", "/")).name
    suffix = Path(safe_name).suffix[:20]
    upload_path = temp_dir / f"source{suffix}"
    size = 0
    try:
        with upload_path.open("wb") as destination:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Upload exceeds the 2 GB limit")
                destination.write(chunk)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    finally:
        await file.close()

    try:
        duration_check = shutil.which("ffprobe")
        if not duration_check:
            raise HTTPException(status_code=503, detail="ffprobe is not installed; install FFmpeg first")
        # The processing pipeline performs authoritative duration/media validation.
        with _lock:
            active = sum(job["status"] in {"queued", "running"} for job in _jobs.values())
            if active >= MAX_QUEUED_JOBS:
                raise HTTPException(status_code=429, detail="The local job queue is full; try again later")
            _jobs[job_id] = {
                "id": job_id, "status": "queued", "progress": "Waiting for the local worker",
                "filename": safe_name, "files": {},
            }
            params = {
                "target_language": target_language, "source_language": source_language,
                "speaker_gender": speaker_gender, "speech_speed": speech_speed,
                "keep_music": keep_music, "glossary_text": glossary_text,
                "whisper_model": whisper_model,
            }
            _executor.submit(_process, job_id, upload_path, params)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    return _snapshot(job_id)


@api.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    return _snapshot(job_id)


@api.get("/api/jobs/{job_id}/files/{kind}")
def get_job_file(job_id: str, kind: str) -> FileResponse:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        path = job.get("files", {}).get(kind)
    if kind not in {"video", "audio", "srt", "vtt"} or not path or not Path(path).is_file():
        raise HTTPException(status_code=404, detail="Output is not available")
    path = Path(path)
    return FileResponse(path, filename=path.name)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(api, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("API_PORT", "8000")))
