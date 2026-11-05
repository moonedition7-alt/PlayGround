from __future__ import annotations

import json
import math
import os
import shutil
import sqlite3
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import Cookie, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pipeline import LANGUAGES, PipelineError, STORAGE, process_media, probe_duration, write_subtitles

DB_PATH = Path(os.getenv("DUB_DB", STORAGE / "dubbing.sqlite3"))
MAX_BYTES = 2 * 1024 * 1024 * 1024
DAILY_MINUTES = int(os.getenv("DAILY_MINUTES", "30"))
app = FastAPI(title="Voxora Dubbing API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
executor = ThreadPoolExecutor(max_workers=max(1, int(os.getenv("DUB_WORKERS", "1"))))


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def initialize() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, input_path TEXT NOT NULL,
            source_language TEXT NOT NULL, targets TEXT NOT NULL, options TEXT NOT NULL,
            status TEXT NOT NULL, step TEXT NOT NULL, progress INTEGER NOT NULL, message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, duration REAL NOT NULL DEFAULT 0,
            result TEXT, error TEXT, segments TEXT
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS usage (
            user_id TEXT NOT NULL, day TEXT NOT NULL, seconds REAL NOT NULL DEFAULT 0,
            PRIMARY KEY(user_id, day)
        )""")


initialize()


def user_identity(user_id: str | None) -> str:
    return user_id or str(uuid.uuid4())


def get_job(job_id: str, user_id: str | None = None, *, internal: bool = False) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if row is None or (not internal and (not user_id or row["user_id"] != user_id)):
        return None
    job = dict(row)
    for key in ("targets", "options", "result", "segments"):
        job[key] = json.loads(job[key]) if job[key] else ({} if key in ("result", "options") else [])
    return job


def update_job(job_id: str, **fields: Any) -> None:
    allowed = {"status", "step", "progress", "message", "result", "error", "segments"}
    values: list[Any] = []
    assignments = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        assignments.append(f"{key}=?")
        values.append(json.dumps(value, ensure_ascii=False) if key in {"result", "segments"} else value)
    if assignments:
        values.append(job_id)
        with connect() as db:
            db.execute(f"UPDATE jobs SET {', '.join(assignments)} WHERE id=?", values)


def run_job(job_id: str) -> None:
    job = get_job(job_id, internal=True)
    if not job:
        return
    update_job(job_id, status="Processing", step="Extract audio", progress=2, message="Starting the dubbing pipeline")
    try:
        def progress(step: str, percent: int, message: str) -> None:
            update_job(job_id, status="Processing", step=step, progress=percent, message=message)
        result = process_media(Path(job["input_path"]), STORAGE / job_id / "outputs", job["source_language"], job["targets"], job["options"], progress)
        update_job(job_id, status="Completed", step="Completed", progress=100, message="Your dubbed files are ready", result=result, segments=result["segments"])
    except Exception as exc:
        update_job(job_id, status="Failed", step="Failed", message="The dub could not be completed", error=str(exc))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "voxora-dubbing"}


@app.get("/api/languages")
def languages() -> dict[str, list[str]]:
    return {"languages": list(LANGUAGES), "source": ["Auto-detect", *LANGUAGES]}


@app.get("/api/usage")
def usage(response: Response, user_id: str | None = Cookie(default=None)) -> dict[str, Any]:
    identity = user_identity(user_id)
    if not user_id:
        response.set_cookie("user_id", identity, httponly=True, samesite="lax", max_age=31536000)
    today = date.today().isoformat()
    with connect() as db:
        row = db.execute("SELECT seconds FROM usage WHERE user_id=? AND day=?", (identity, today)).fetchone()
    used = float(row["seconds"]) / 60 if row else 0
    return {"used_minutes": round(used, 1), "remaining_minutes": max(0, round(DAILY_MINUTES - used, 1)), "daily_limit_minutes": DAILY_MINUTES, "resets_at": "midnight local time", "user_id": identity}


@app.get("/api/jobs")
def list_jobs(user_id: str | None = Cookie(default=None)) -> list[dict[str, Any]]:
    if not user_id:
        return []
    with connect() as db:
        rows = db.execute("SELECT id,name,source_language,targets,status,step,progress,message,created_at,duration,error FROM jobs WHERE user_id=? ORDER BY created_at DESC", (user_id,)).fetchall()
    values = []
    for row in rows:
        item = dict(row)
        item["targets"] = json.loads(item["targets"])
        values.append(item)
    return values


@app.post("/api/jobs")
async def create_job(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    source_language: str = Form("Auto-detect"),
    targets: str = Form(...),
    speakers: int = Form(1),
    keep_music: bool = Form(True),
    voice_gender: str = Form("Female"),
    speech_speed: float = Form(1.0),
    burn_subtitles: bool = Form(False),
    glossary: str = Form(""),
    cloning: bool = Form(False),
    clone_consent: bool = Form(False),
    user_id: str | None = Cookie(default=None),
) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(400, "Choose a media file first.")
    suffix = Path(file.filename).suffix.lower()
    allowed = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
    if suffix not in allowed:
        raise HTTPException(415, "Supported files: MP4, MOV, MKV, WEBM, AVI, MP3, WAV, M4A, AAC, OGG, and FLAC.")
    if source_language not in {"Auto-detect", *LANGUAGES}:
        raise HTTPException(400, "Unsupported source language.")
    try:
        target_list = list(dict.fromkeys(json.loads(targets)))
    except (ValueError, TypeError):
        raise HTTPException(400, "Select at least one target language.")
    if not target_list or any(target not in LANGUAGES for target in target_list):
        raise HTTPException(400, "Select one or more supported target languages.")
    if speakers not in range(1, 6):
        raise HTTPException(400, "Speaker count must be between 1 and 5.")
    if not 0.75 <= speech_speed <= 1.25:
        raise HTTPException(400, "Speech speed must be from 0.75× to 1.25×.")
    if cloning and not clone_consent:
        raise HTTPException(400, "Confirm that you have rights to use this voice before enabling voice cloning.")
    identity = user_identity(user_id)
    job_id = str(uuid.uuid4())
    input_dir = STORAGE / job_id
    input_dir.mkdir(parents=True, exist_ok=True)
    saved_path = input_dir / f"input{suffix}"
    size = 0
    try:
        with saved_path.open("wb") as destination:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "The maximum upload size is 2 GB.")
                destination.write(chunk)
    except Exception:
        shutil.rmtree(input_dir, ignore_errors=True)
        raise
    try:
        duration = probe_duration(saved_path)
        if duration > 3600:
            raise HTTPException(400, "Files must be one hour or shorter.")
    except HTTPException:
        shutil.rmtree(input_dir, ignore_errors=True)
        raise
    except PipelineError as exc:
        shutil.rmtree(input_dir, ignore_errors=True)
        raise HTTPException(400, str(exc))
    today = date.today().isoformat()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT seconds FROM usage WHERE user_id=? AND day=?", (identity, today)).fetchone()
        used = float(row["seconds"]) if row else 0
        if used + duration > DAILY_MINUTES * 60:
            db.rollback()
            shutil.rmtree(input_dir, ignore_errors=True)
            raise HTTPException(429, f"This file exceeds today's remaining free minutes ({max(0, DAILY_MINUTES-used/60):.1f} min left).")
        db.execute("INSERT INTO usage(user_id,day,seconds) VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET seconds=seconds+excluded.seconds", (identity, today, duration))
        options = {"speakers": speakers, "keep_music": keep_music, "voice_gender": voice_gender, "speech_speed": speech_speed, "burn_subtitles": burn_subtitles, "glossary": glossary, "cloning": cloning}
        display_name = Path(file.filename).stem[:120]
        db.execute("INSERT INTO jobs(id,user_id,name,input_path,source_language,targets,options,status,step,progress,message,duration) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (job_id, identity, display_name, str(saved_path), source_language, json.dumps(target_list), json.dumps(options), "Queued", "Queued", 0, "Waiting for a worker", duration))
        db.commit()
    payload = {"id": job_id, "name": Path(file.filename).stem, "status": "Queued", "duration": duration, "user_id": identity}
    request.state.user_id = identity
    if not user_id:
        response.set_cookie("user_id", identity, httponly=True, samesite="lax", max_age=31536000)
    executor.submit(run_job, job_id)
    return payload


@app.get("/api/jobs/{job_id}")
def job_detail(job_id: str, user_id: str | None = Cookie(default=None)) -> dict[str, Any]:
    job = get_job(job_id, user_id)
    if not job:
        raise HTTPException(404, "Dub not found.")
    # Keep local paths private; return only API download URLs.
    result = {}
    for target, paths in job["result"].get("outputs", {}).items():
        result[target] = {kind: f"/api/jobs/{job_id}/download/{target}/{kind}" for kind in paths}
    original_url = f"/api/jobs/{job_id}/original"
    return {key: job[key] for key in ("id", "name", "source_language", "targets", "options", "status", "step", "progress", "message", "created_at", "duration", "error", "segments")} | {"result": result, "original_url": original_url}


@app.put("/api/jobs/{job_id}/segments")
def save_segments(job_id: str, body: dict[str, Any], user_id: str | None = Cookie(default=None)) -> dict[str, str]:
    job = get_job(job_id, user_id)
    if not job:
        raise HTTPException(404, "Dub not found.")
    if job["status"] != "Completed":
        raise HTTPException(409, "Transcript editing is available after processing completes.")
    segments = body.get("segments")
    if not isinstance(segments, list) or len(segments) > 20_000:
        raise HTTPException(400, "Invalid subtitle segments.")
    for segment in segments:
        if not isinstance(segment, dict) or not isinstance(segment.get("text"), str):
            raise HTTPException(400, "Each segment needs text and a translation.")
        if len(segment["text"]) > 5000:
            raise HTTPException(400, "Subtitle text is too long.")
        start, end = segment.get("start"), segment.get("end")
        if (not isinstance(start, (int, float)) or isinstance(start, bool)
                or not isinstance(end, (int, float)) or isinstance(end, bool)
                or not math.isfinite(start) or not math.isfinite(end)
                or start < 0 or end <= start or end > job["duration"] + 1):
            raise HTTPException(400, "Subtitle timestamps must be valid and within the media duration.")
        translations = segment.get("translation")
        if not isinstance(translations, dict) or any(
            target not in job["targets"] or not isinstance(text, str) or len(text) > 5000
            for target, text in translations.items()
        ):
            raise HTTPException(400, "Each segment needs valid translation text.")
    # Keep downloadable captions in sync with transcript edits. Existing audio and
    # any subtitles already burned into the rendered video are not re-generated.
    for target in job["targets"]:
        paths = job["result"].get("outputs", {}).get(target, {})
        target_segments = [
            {**segment, "translation": segment.get("translation", {}).get(target, "")}
            for segment in segments
        ]
        for kind, is_vtt in (("srt", False), ("vtt", True)):
            if paths.get(kind):
                caption_path = locate_file(job_id, paths[kind], user_id)
                write_subtitles(target_segments, caption_path, is_vtt)
    update_job(job_id, segments=segments)
    return {"status": "saved", "captions_updated": True}


def locate_file(job_id: str, path: str, user_id: str | None) -> Path:
    job = get_job(job_id, user_id)
    if not job:
        raise HTTPException(404, "Dub not found.")
    candidate = Path(path).resolve()
    try:
        candidate.relative_to((STORAGE / job_id).resolve())
    except ValueError:
        raise HTTPException(404, "File not found.")
    if not candidate.is_file():
        raise HTTPException(404, "File not found.")
    return candidate


@app.get("/api/jobs/{job_id}/download/{target}/{kind}")
def download(job_id: str, target: str, kind: str, user_id: str | None = Cookie(default=None)) -> FileResponse:
    if kind not in {"mp4", "mp3", "srt", "vtt"}:
        raise HTTPException(404, "Download format not found.")
    job = get_job(job_id, user_id)
    if not job:
        raise HTTPException(404, "Dub not found.")
    paths = job["result"].get("outputs", {}).get(target, {})
    path = paths.get(kind)
    if not path:
        raise HTTPException(404, "Download is not ready.")
    file_path = locate_file(job_id, path, user_id)
    return FileResponse(file_path, filename=file_path.name)


@app.get("/api/jobs/{job_id}/original")
def original(job_id: str, user_id: str | None = Cookie(default=None)) -> FileResponse:
    job = get_job(job_id, user_id)
    if not job:
        raise HTTPException(404, "Dub not found.")
    file_path = locate_file(job_id, job["input_path"], user_id)
    return FileResponse(file_path, filename=file_path.name, media_type="video/mp4" if file_path.suffix in {".mp4", ".mov", ".mkv", ".webm", ".avi"} else "audio/mpeg")


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str, user_id: str | None = Cookie(default=None)) -> dict[str, str]:
    job = get_job(job_id, user_id)
    if not job:
        raise HTTPException(404, "Dub not found.")
    if job["status"] == "Processing":
        raise HTTPException(409, "Wait until processing finishes before deleting this dub.")
    with connect() as db:
        db.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    shutil.rmtree(STORAGE / job_id, ignore_errors=True)
    return {"status": "deleted"}
