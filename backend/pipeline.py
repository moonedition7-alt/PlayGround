from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent
STORAGE = Path(os.getenv("DUB_STORAGE", ROOT / "storage")).resolve()
STORAGE.mkdir(parents=True, exist_ok=True)

LANGUAGES = {
    "Hindi": ("hi", "hin_Deva", "hi-IN-SwaraNeural", "hi-IN-MadhurNeural"),
    "Kannada": ("kn", "kan_Knda", "kn-IN-SapnaNeural", "kn-IN-GaganNeural"),
    "Tamil": ("ta", "tam_Taml", "ta-IN-PallaviNeural", "ta-IN-ValluvarNeural"),
    "Telugu": ("te", "tel_Telu", "te-IN-ShrutiNeural", "te-IN-MohanNeural"),
    "Malayalam": ("ml", "mal_Mlym", "ml-IN-SobhanaNeural", "ml-IN-MidhunNeural"),
    "Marathi": ("mr", "mar_Deva", "mr-IN-AarohiNeural", "mr-IN-ManoharNeural"),
    "Bengali": ("bn", "ben_Beng", "bn-IN-TanishaaNeural", "bn-IN-BashkarNeural"),
    "Gujarati": ("gu", "gujr_Gujr", "gu-IN-DhwaniNeural", "gu-IN-NiranjanNeural"),
    "Punjabi": ("pa", "pan_Guru", "pa-IN-VaaniNeural", "pa-IN-OjasNeural"),
    "Odia": ("or", "ory_Orya", "or-IN-SubhasiniNeural", "or-IN-SukantNeural"),
    "Urdu": ("ur", "urd_Arab", "ur-PK-UzmaNeural", "ur-PK-AsadNeural"),
    "English": ("en", "eng_Latn", "en-US-AvaNeural", "en-US-AndrewNeural"),
}

class PipelineError(RuntimeError):
    pass


def run(command: list[str], *, timeout: int = 3600) -> str:
    try:
        result = subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise PipelineError(f"Required program is missing: {command[0]}. Install FFmpeg and ensure it is on PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise PipelineError(f"Processing timed out while running {Path(command[0]).name}.") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip().splitlines()[-8:]
        raise PipelineError("Processing command failed: " + "\n".join(detail)) from exc
    return result.stdout.strip()


def probe_duration(path: Path) -> float:
    raw = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)])
    try:
        return float(raw)
    except ValueError as exc:
        raise PipelineError("Could not read the media duration. Please upload a valid audio or video file.") from exc


def segments_from_words(words: list[Any], transcript: str) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    chunk: list[Any] = []
    for word in words:
        chunk.append(word)
        text = str(getattr(word, "word", "")).strip()
        gap = getattr(word, "start", 0) - getattr(chunk[-2], "end", 0) if len(chunk) > 1 else 0
        if (re.search(r"[.!?。؟।]$", text) and len(chunk) >= 3) or gap > 0.9 or len(chunk) >= 22:
            segments.append(_word_segment(chunk))
            chunk = []
    if chunk:
        segments.append(_word_segment(chunk))
    if not segments and transcript.strip():
        segments = [{"start": 0.0, "end": 0.0, "text": transcript.strip()}]
    return segments


def _word_segment(words: list[Any]) -> dict[str, Any]:
    return {
        "start": max(0.0, float(getattr(words[0], "start", 0))),
        "end": max(float(getattr(words[0], "start", 0)) + 0.1, float(getattr(words[-1], "end", 0))),
        "text": " ".join(str(getattr(word, "word", "")).strip() for word in words).strip(),
    }


class Translator:
    _lock = threading.Lock()
    _instance: "Translator | None" = None

    def __init__(self) -> None:
        try:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            import torch
        except ImportError as exc:
            raise PipelineError("Translation needs the optional AI packages. Install them with: pip install -r requirements-ai.txt") from exc
        model_name = os.getenv("NLLB_MODEL", "facebook/nllb-200-distilled-600M")
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
            self.torch = torch
        except Exception as exc:
            raise PipelineError(f"Could not load the free NLLB translation model ({model_name}): {exc}") from exc

    @classmethod
    def get(cls) -> "Translator":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def translate(self, text: str, source: str, target: str, glossary: list[str]) -> str:
        if source not in LANGUAGES or target not in LANGUAGES:
            raise PipelineError("Choose a supported source and target language.")
        source_code, target_code = LANGUAGES[source][1], LANGUAGES[target][1]
        protected: dict[str, str] = {}
        working = text
        for index, term in enumerate(sorted(set(glossary), key=len, reverse=True)):
            term = term.strip()
            if term:
                marker = f"ZZZKEEP{index}TOKENZZZ"
                working = re.sub(re.escape(term), marker, working, flags=re.IGNORECASE)
                protected[marker] = term
        try:
            self.tokenizer.src_lang = source_code
            inputs = self.tokenizer(working, return_tensors="pt", truncation=True, max_length=512)
            generated = self.model.generate(**inputs, forced_bos_token_id=self.tokenizer.convert_tokens_to_ids(target_code), max_new_tokens=512)
            result = self.tokenizer.batch_decode(generated, skip_special_tokens=True)[0]
        except Exception as exc:
            raise PipelineError(f"Translation failed for {target}: {exc}") from exc
        for marker, term in protected.items():
            result = result.replace(marker, term).replace(marker.lower(), term)
        return result.strip()


def transcribe(audio_path: Path, source_language: str) -> tuple[str, str, list[dict[str, Any]]]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise PipelineError("Speech recognition needs faster-whisper. Install it with: pip install -r requirements-ai.txt") from exc
    model_name = os.getenv("WHISPER_MODEL", "small")
    device = os.getenv("WHISPER_DEVICE", "cpu")
    compute = os.getenv("WHISPER_COMPUTE_TYPE", "int8" if device == "cpu" else "float16")
    try:
        model = WhisperModel(model_name, device=device, compute_type=compute)
        language = None if source_language == "Auto-detect" else LANGUAGES[source_language][0]
        pieces, info = model.transcribe(str(audio_path), language=language, word_timestamps=True, vad_filter=True, beam_size=5)
        words = []
        texts = []
        for piece in pieces:
            texts.append(piece.text.strip())
            words.extend(piece.words or [])
        text = " ".join(part for part in texts if part).strip()
        found_language = next((name for name, row in LANGUAGES.items() if row[0] == info.language), info.language)
        return text, found_language, segments_from_words(words, text)
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError(f"Speech recognition failed: {exc}") from exc


async def synthesize(text: str, voice: str, path: Path, rate: int = 0) -> None:
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, voice, rate=f"{rate:+d}%")
        await communicate.save(str(path))
    except ImportError as exc:
        raise PipelineError("Text-to-speech needs edge-tts. Install it with: pip install -r requirements-ai.txt") from exc
    except Exception as exc:
        raise PipelineError(f"Voice generation failed. Check your internet connection and try again: {exc}") from exc


def write_subtitles(segments: list[dict[str, Any]], path: Path, vtt: bool = False) -> None:
    def stamp(seconds: float, comma: bool) -> str:
        ms = max(0, round(seconds * 1000))
        h, ms = divmod(ms, 3_600_000)
        m, ms = divmod(ms, 60_000)
        s, ms = divmod(ms, 1000)
        return f"{h:02}:{m:02}:{s:02}{',' if comma else '.'}{ms:03}"
    with path.open("w", encoding="utf-8") as file:
        if vtt:
            file.write("WEBVTT\n\n")
        for i, segment in enumerate(segments, 1):
            file.write(f"{i}\n" if not vtt else "")
            file.write(f"{stamp(segment['start'], not vtt)} --> {stamp(segment['end'], not vtt)}\n{segment['translation']}\n\n")


def _split_vocals(audio: Path, temp: Path) -> tuple[Path, Path | None]:
    try:
        import demucs  # noqa: F401
    except ImportError:
        return audio, None
    run([os.getenv("PYTHON", "python"), "-m", "demucs", "--two-stems=vocals", "-n", os.getenv("DEMUCS_MODEL", "htdemucs"), "-o", str(temp / "stems"), str(audio)], timeout=7200)
    output = temp / "stems" / os.getenv("DEMUCS_MODEL", "htdemucs") / audio.stem
    vocals, accompaniment = output / "vocals.wav", output / "no_vocals.wav"
    if not vocals.exists() or not accompaniment.exists():
        raise PipelineError("Demucs finished but its vocal/accompaniment stems were not found.")
    return vocals, accompaniment


def process_media(
    input_path: Path,
    output_dir: Path,
    source_language: str,
    targets: list[str],
    options: dict[str, Any],
    progress: Callable[[str, int, str], None] | None = None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    job_tmp = Path(tempfile.mkdtemp(prefix="dub-", dir=STORAGE))
    emit = progress or (lambda _step, _percent, _message: None)
    try:
        duration = probe_duration(input_path)
        if duration > 3600:
            raise PipelineError("Files must be one hour or shorter.")
        emit("Extract audio", 8, "Extracting a clean audio track with FFmpeg")
        source_wav = job_tmp / "source.wav"
        run(["ffmpeg", "-y", "-i", str(input_path), "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(source_wav)])
        emit("Separate vocals", 20, "Separating dialogue from background audio" if options.get("keep_music") else "Preparing dialogue track")
        vocals, background = _split_vocals(source_wav, job_tmp) if options.get("keep_music") else (source_wav, None)
        if options.get("keep_music") and background is None:
            raise PipelineError("Background music preservation requires Demucs. Install it with: pip install -r requirements-ai.txt")
        emit("Transcribe", 33, "Recognizing speech and word-level timing")
        transcript, detected_language, segments = transcribe(vocals, source_language)
        if not segments:
            raise PipelineError("No speech was detected. Try a clearer file or a different source language.")
        original_lang = detected_language if source_language == "Auto-detect" else source_language
        emit("Translate", 48, f"Translating {len(segments)} timed speech segments")
        translator = Translator.get()
        glossary = [part.strip() for part in str(options.get("glossary", "")).split(",") if part.strip()]
        for segment in segments:
            segment["translation"] = {}
            for target in targets:
                segment["translation"][target] = translator.translate(segment["text"], original_lang, target, glossary)
        result_files: dict[str, dict[str, str]] = {}
        for target_index, target in enumerate(targets):
            emit("Generate voice", 56 + int(22 * target_index / max(1, len(targets))), f"Generating {target} voice clips")
            target_dir = output_dir / target.lower()
            target_dir.mkdir(parents=True, exist_ok=True)
            _, _, female_voice, male_voice = LANGUAGES[target]
            voice = female_voice if options.get("voice_gender", "Female") == "Female" else male_voice
            clip_files: list[Path] = []
            slot_lengths: list[float] = []
            for index, segment in enumerate(segments):
                clip = job_tmp / f"{target_index}-{index}.mp3"
                slot = max(0.18, min(duration - segment["start"], segment["end"] - segment["start"] + 0.12))
                text = segment["translation"][target]
                awaitable = synthesize(text, voice, clip, int((float(options.get("speech_speed", 1)) - 1) * 100))
                asyncio.run(awaitable)
                clip_len = probe_duration(clip)
                if clip_len > slot * 1.25:
                    words = text.split()
                    while len(words) > 2 and clip_len > slot * 1.25:
                        words = words[:-1]
                        text = " ".join(words).rstrip(" ,;:") + "…"
                        asyncio.run(synthesize(text, voice, clip, int((float(options.get("speech_speed", 1)) - 1) * 100)))
                        clip_len = probe_duration(clip)
                    segment["translation"][target] = text
                fit_rate = min(1.25, max(1.0, clip_len / slot))
                normalized_clip = job_tmp / f"fit-{target_index}-{index}.wav"
                run(["ffmpeg", "-y", "-i", str(clip), "-filter:a", f"atempo={fit_rate:.4f},apad,atrim=duration={slot:.3f}", "-ac", "2", "-ar", "44100", str(normalized_clip)])
                clip_files.append(normalized_clip)
                slot_lengths.append(slot)
            emit("Sync", 83 + int(7 * target_index / max(1, len(targets))), f"Fitting {target} speech to the original pauses")
            # Build the speech timeline with one delayed, padded input per segment. Each clip is
            # trimmed to its own slot, so adjacent words can never overlap.
            filter_parts = []
            inputs = []
            for i, (clip, segment, slot) in enumerate(zip(clip_files, segments, slot_lengths)):
                inputs += ["-i", str(clip)]
                delay = int(segment["start"] * 1000)
                filter_parts.append(f"[{i}:a]adelay={delay}|{delay},apad,atrim=duration={duration:.3f}[a{i}]")
            labels = "".join(f"[a{i}]" for i in range(len(clip_files)))
            filter_parts.append(f"{labels}amix=inputs={len(clip_files)}:duration=longest:normalize=0,alimiter=limit=0.95,dynaudnorm=f=150:g=7,loudnorm=I=-16:TP=-1.5:LRA=11[dub]")
            dub_audio = target_dir / f"dubbed-{target.lower()}.mp3"
            run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filter_parts), "-map", "[dub]", "-t", f"{duration:.3f}", "-codec:a", "libmp3lame", "-q:a", "2", str(dub_audio)])
            if background:
                mixed = target_dir / "mixed.wav"
                run(["ffmpeg", "-y", "-i", str(dub_audio), "-i", str(background), "-filter_complex", "[1:a]volume=0.8[bg];[0:a][bg]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]", "-map", "[out]", "-t", f"{duration:.3f}", str(mixed)])
                run(["ffmpeg", "-y", "-i", str(mixed), "-codec:a", "libmp3lame", "-q:a", "2", str(dub_audio)])
            emit("Merge", 94, "Muxing dubbed audio and writing subtitle files")
            mp4 = target_dir / f"dubbed-{target.lower()}.mp4"
            srt, vtt = target_dir / f"subtitles-{target.lower()}.srt", target_dir / f"subtitles-{target.lower()}.vtt"
            write_subtitles([{**s, "translation": s["translation"][target]} for s in segments], srt)
            write_subtitles([{**s, "translation": s["translation"][target]} for s in segments], vtt, True)
            mux_command = ["ffmpeg", "-y", "-i", str(input_path), "-i", str(dub_audio), "-map", "0:v?", "-map", "1:a:0"]
            if options.get("burn_subtitles"):
                subtitle_path = str(srt).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
                mux_command += ["-vf", f"subtitles='{subtitle_path}'"]
                mux_command += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21"]
            else:
                mux_command += ["-c:v", "copy"]
            mux_command += ["-c:a", "aac", "-b:a", "192k", "-shortest", str(mp4)]
            run(mux_command)
            result_files[target] = {"mp4": str(mp4), "mp3": str(dub_audio), "srt": str(srt), "vtt": str(vtt)}
        emit("Completed", 100, "Your dubbed files are ready")
        return {"duration": duration, "detected_language": detected_language, "transcript": transcript, "segments": segments, "outputs": result_files}
    finally:
        shutil.rmtree(job_tmp, ignore_errors=True)
