from __future__ import annotations

import asyncio
import os
import shutil
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .render import render_video

ROOT = Path(os.getenv("FVS_DATA_DIR", Path(__file__).parent / "data")).resolve()
OUTPUTS = ROOT / "outputs"
UPLOADS = ROOT / "uploads"
for directory in (OUTPUTS, UPLOADS):
    directory.mkdir(parents=True, exist_ok=True)

JOB_TTL = 60 * 60
MAX_QUEUE = int(os.getenv("FVS_MAX_QUEUE", "3"))
ALLOWED_ORIGINS = os.getenv("FVS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")


class TextRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)
    negative_prompt: str = Field(default="", max_length=1000)
    duration: int = Field(default=3, ge=2, le=5)
    aspect_ratio: str = "16:9"
    resolution: str = "480p"
    seed: Optional[int] = None


class EnhanceRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)


class JobManager:
    def __init__(self) -> None:
        self.jobs: dict[str, dict] = {}
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.lock = asyncio.Lock()
        self.worker_task: Optional[asyncio.Task] = None
        self.cleanup_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        self.worker_task = asyncio.create_task(self._worker())
        self.cleanup_task = asyncio.create_task(self._cleanup())

    async def stop(self) -> None:
        for task in (self.worker_task, self.cleanup_task):
            if task:
                task.cancel()
        await asyncio.gather(*(t for t in (self.worker_task, self.cleanup_task) if t), return_exceptions=True)

    async def submit(self, session_id: str, payload: dict) -> dict:
        async with self.lock:
            active = [j for j in self.jobs.values() if j["session_id"] == session_id and j["status"] in ("queued", "running")]
            if active:
                raise HTTPException(409, "You already have a video in progress. Please wait for it to finish.")
            waiting = sum(1 for j in self.jobs.values() if j["status"] == "queued")
            running = any(j["status"] == "running" for j in self.jobs.values())
            if waiting >= MAX_QUEUE:
                raise HTTPException(503, "The GPU is busy. Try again in 1 minute.")
            job_id = uuid.uuid4().hex
            job = {
                "id": job_id, "session_id": session_id, "status": "queued", "progress": 0,
                "queue_position": waiting + (1 if running else 0) + 1,
                "estimated_seconds": max(30, (waiting + (1 if running else 0) + 1) * 90),
                "created_at": time.time(), "updated_at": time.time(), "video_url": None,
                "error": None, **payload,
            }
            self.jobs[job_id] = job
            await self.queue.put(job_id)
            return self.public(job)

    @staticmethod
    def public(job: dict) -> dict:
        return {key: value for key, value in job.items() if key not in ("session_id", "image_path", "output_path", "created_at", "updated_at")}

    async def get(self, job_id: str, session_id: str) -> dict:
        job = self.jobs.get(job_id)
        if not job or job["session_id"] != session_id:
            raise HTTPException(404, "Video job not found.")
        return self.public(job)

    async def _worker(self) -> None:
        while True:
            job_id = await self.queue.get()
            job = self.jobs.get(job_id)
            if not job:
                self.queue.task_done()
                continue
            job["status"] = "running"
            job["queue_position"] = 0
            job["updated_at"] = time.time()
            loop = asyncio.get_running_loop()
            output = OUTPUTS / f"{job_id}.mp4"
            try:
                await asyncio.to_thread(render_video, job, output, loop, self._progress)
                job["status"] = "completed"
                job["progress"] = 100
                job["video_url"] = f"/api/videos/{job_id}"
                job["output_path"] = str(output)
            except Exception as exc:
                job["status"] = "failed"
                message = str(exc).strip() or "The video render failed."
                job["error"] = message[:500]
                output.unlink(missing_ok=True)
            finally:
                job["updated_at"] = time.time()
                self.queue.task_done()
                self._refresh_queue_positions()

    def _progress(self, job_id: str, value: int) -> None:
        job = self.jobs.get(job_id)
        if job:
            job["progress"] = max(0, min(99, int(value)))
            job["updated_at"] = time.time()

    def _refresh_queue_positions(self) -> None:
        position = 1
        for job in self.jobs.values():
            if job["status"] == "queued":
                job["queue_position"] = position
                job["estimated_seconds"] = position * 90
                position += 1

    async def _cleanup(self) -> None:
        while True:
            await asyncio.sleep(60)
            cutoff = time.time() - JOB_TTL
            for job_id, job in list(self.jobs.items()):
                if job["updated_at"] >= cutoff or job["status"] in ("queued", "running"):
                    continue
                if job.get("output_path"):
                    Path(job["output_path"]).unlink(missing_ok=True)
                if job.get("image_path"):
                    Path(job["image_path"]).unlink(missing_ok=True)
                self.jobs.pop(job_id, None)
            for path in UPLOADS.iterdir():
                if path.is_file() and path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)


manager = JobManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await manager.start()
    yield
    await manager.stop()


app = FastAPI(title="FreeVideo Studio API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Session-ID"],
)


def require_session(session_id: Optional[str]) -> str:
    if not session_id or len(session_id) > 80:
        raise HTTPException(400, "A browser session ID is required.")
    return session_id


@app.get("/api/health")
async def health():
    return {"status": "ok", "model": os.getenv("FVS_MODEL", "THUDM/CogVideoX-2b"), "queue_limit": MAX_QUEUE}


@app.post("/api/enhance")
async def enhance(request: EnhanceRequest):
    prompt = request.prompt.strip().rstrip(".!?")
    if len(prompt) < 3:
        raise HTTPException(422, "Add a little more detail to your prompt.")
    return {"prompt": f"{prompt}. Cinematic composition, thoughtful camera movement, natural lighting, rich fine detail, atmospheric depth, smooth motion, filmic color grading."}


@app.post("/api/jobs/text")
async def create_text_job(request: TextRequest, x_session_id: Optional[str] = Header(default=None)):
    session_id = require_session(x_session_id)
    payload = request.model_dump()
    validate_options(payload)
    payload["mode"] = "text"
    return await manager.submit(session_id, payload)


@app.post("/api/jobs/image")
async def create_image_job(
    image: UploadFile = File(...), prompt: str = Form(default=""),
    negative_prompt: str = Form(default=""), duration: int = Form(default=3),
    aspect_ratio: str = Form(default="16:9"), resolution: str = Form(default="480p"),
    seed: Optional[int] = Form(default=None), motion_strength: float = Form(default=0.55),
    x_session_id: Optional[str] = Header(default=None),
):
    session_id = require_session(x_session_id)
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(415, "Upload a PNG, JPEG, or WebP image.")
    if image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(415, "Only JPEG, PNG, and WebP images are supported.")
    data = await image.read(12 * 1024 * 1024 + 1)
    if not data or len(data) > 12 * 1024 * 1024:
        raise HTTPException(413, "Images must be smaller than 12 MB.")
    payload = {"prompt": prompt[:500], "negative_prompt": negative_prompt[:1000], "duration": duration,
               "aspect_ratio": aspect_ratio, "resolution": resolution, "seed": seed,
               "motion_strength": max(0.0, min(1.0, motion_strength)), "mode": "image"}
    validate_options(payload)
    suffix = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[image.content_type]
    image_path = UPLOADS / f"{uuid.uuid4().hex}{suffix}"
    image_path.write_bytes(data)
    payload["image_path"] = str(image_path)
    try:
        return await manager.submit(session_id, payload)
    except Exception:
        image_path.unlink(missing_ok=True)
        raise


def validate_options(payload: dict) -> None:
    if payload["duration"] not in (2, 3, 4, 5):
        raise HTTPException(422, "Duration must be between 2 and 5 seconds.")
    if payload["aspect_ratio"] not in ("16:9", "9:16", "1:1"):
        raise HTTPException(422, "Choose 16:9, 9:16, or 1:1 aspect ratio.")
    if payload["resolution"] not in ("480p", "720p"):
        raise HTTPException(422, "Choose 480p or 720p resolution.")


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str, x_session_id: Optional[str] = Header(default=None)):
    return await manager.get(job_id, require_session(x_session_id))


@app.get("/api/videos/{job_id}")
async def get_video(job_id: str, x_session_id: Optional[str] = Header(default=None)):
    session_id = require_session(x_session_id)
    job = manager.jobs.get(job_id)
    if not job or job["session_id"] != session_id or job["status"] != "completed" or not job.get("output_path"):
        raise HTTPException(404, "Video not found or it has expired.")
    path = Path(job["output_path"])
    if not path.is_file():
        raise HTTPException(404, "Video has expired. Please render it again.")
    return FileResponse(path, media_type="video/mp4", filename=f"freevideo-{job_id}.mp4")
