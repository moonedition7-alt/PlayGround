"""OpenDub: Gradio inference backend for the browser-based dubbing studio.

The browser extracts a mono WAV and keeps the original media local. This backend
returns dubbed audio, translated subtitles, and text; the browser muxes MP4 locally
so the source video is never uploaded to the inference backend.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Iterator

import gradio as gr

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", ROOT / "outputs")).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
MAX_BYTES = 200 * 1024 * 1024
MAX_SECONDS = 10 * 60
MAX_TTS_CONCURRENCY = 8
WHISPER_MODEL = "small"
TRANSLATION_MODEL = "facebook/nllb-200-distilled-600M"

LANGUAGES = {
    "Hindi": ("hin_Deva", "hi", "hi-IN-SwaraNeural", "hi-IN-MadhurNeural"),
    "Kannada": ("kan_Knda", "kn", "kn-IN-SapnaNeural", "kn-IN-GaganNeural"),
    "Tamil": ("tam_Taml", "ta", "ta-IN-PallaviNeural", "ta-IN-ValluvarNeural"),
    "Telugu": ("tel_Telu", "te", "te-IN-ShrutiNeural", "te-IN-MohanNeural"),
    "Malayalam": ("mal_Mlym", "ml", "ml-IN-SobhanaNeural", "ml-IN-MidhunNeural"),
    "Marathi": ("mar_Deva", "mr", "mr-IN-AarohiNeural", "mr-IN-ManoharNeural"),
    "Bengali": ("ben_Beng", "bn", "bn-IN-TanishaaNeural", "bn-IN-BashkarNeural"),
    "Gujarati": ("guj_Gujr", "gu", "gu-IN-DhwaniNeural", "gu-IN-NiranjanNeural"),
    "English": ("eng_Latn", "en", "en-US-AriaNeural", "en-US-GuyNeural"),
}
SOURCE_CODES = {"Auto-detect": None, **{name: data[1] for name, data in LANGUAGES.items()}}
NLLB_CODES = {data[1]: data[0] for data in LANGUAGES.values()}

_whisper_lock = threading.Lock()
_whisper_models = {}
_translator = None
_translation_lock = threading.Lock()


def _run(command: list[str], timeout: int = 900) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise RuntimeError(f"Required program is missing: {command[0]}. Install FFmpeg and ffprobe.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Media processing timed out. Retry with a shorter clip.") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout)[-1800:]
        raise RuntimeError(f"{command[0]} failed: {detail}")
    return result


def _duration(path: Path) -> float:
    result = _run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ])
    try:
        duration = float(result.stdout.strip())
    except ValueError as exc:
        raise RuntimeError("Could not read audio duration. Make sure the WAV is valid.") from exc
    if duration <= 0 or duration > MAX_SECONDS:
        raise RuntimeError("Clips must be longer than zero and no more than 10 minutes.")
    return duration


def _cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


def _transcribe(audio_path: Path, source_language: str):
    from faster_whisper import WhisperModel

    use_gpu = os.getenv("WHISPER_DEVICE", "cuda" if _cuda_available() else "cpu") == "cuda"
    compute = "float16" if use_gpu else "int8"
    cache_key = (WHISPER_MODEL, "cuda" if use_gpu else "cpu", compute)
    with _whisper_lock:
        model = _whisper_models.get(cache_key)
        if model is None:
            compute = os.getenv("WHISPER_COMPUTE_TYPE", compute)
            model = WhisperModel(WHISPER_MODEL, device=cache_key[1], compute_type=compute)
            _whisper_models[cache_key] = model
    language = SOURCE_CODES.get(source_language)
    segments, info = model.transcribe(str(audio_path), language=language, beam_size=1, vad_filter=True)
    rows = [
        (max(0.0, float(seg.start)), max(0.05, float(seg.end)), (seg.text or "").strip())
        for seg in segments if (seg.text or "").strip()
    ]
    return rows, info.language


def _get_translator():
    global _translator
    with _translation_lock:
        if _translator is None:
            import torch
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

            model_id = os.getenv("TRANSLATION_MODEL", TRANSLATION_MODEL)
            tokenizer = AutoTokenizer.from_pretrained(model_id)
            model = AutoModelForSeq2SeqLM.from_pretrained(model_id)
            # CUDA/T4 inference uses fp16; CPU fallback stays fp32 for compatibility.
            if torch.cuda.is_available():
                model = model.to("cuda", dtype=torch.float16)
            model.eval()
            _translator = (tokenizer, model, torch)
    return _translator


def _translate_batch(texts: list[str], source_code: str, target_code: str) -> list[str]:
    tokenizer, model, torch = _get_translator()
    tokenizer.src_lang = source_code
    results = []
    for offset in range(0, len(texts), 16):
        batch = texts[offset:offset + 16]
        encoded = tokenizer(batch, return_tensors="pt", padding=True, truncation=True, max_length=512)
        device = next(model.parameters()).device
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.inference_mode():
            tokens = model.generate(
                **encoded,
                forced_bos_token_id=tokenizer.convert_tokens_to_ids(target_code),
                max_new_tokens=256,
                num_beams=2,
            )
        results.extend(text.strip() for text in tokenizer.batch_decode(tokens, skip_special_tokens=True))
    return results


def _srt_time(seconds: float) -> str:
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    whole, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{whole:02},{millis:03}"


def _write_srt(rows, path: Path) -> None:
    entries = [
        f"{index}\n{_srt_time(start)} --> {_srt_time(end)}\n{text}"
        for index, (start, end, text) in enumerate(rows, 1)
    ]
    path.write_text("\n\n".join(entries) + "\n", encoding="utf-8")


async def _synthesize(texts: list[str], voice: str, rate: int, temp_dir: Path) -> list[Path]:
    import edge_tts

    semaphore = asyncio.Semaphore(MAX_TTS_CONCURRENCY)

    async def one(index: int, text: str) -> Path:
        path = temp_dir / f"voice-{index:05}.mp3"
        async with semaphore:
            await edge_tts.Communicate(text, voice, rate=f"{rate:+d}%").save(str(path))
        return path

    return await asyncio.gather(*(one(i, text) for i, text in enumerate(texts)))


def _atempo_filter(factor: float) -> str:
    return f"atempo={min(1.6, max(0.5, factor)):.5f}"


def dub_audio(audio_file, target_language: str, source_language: str,
              voice_gender: str, speech_speed: float, keep_background: bool) -> Iterator:
    """Yield stage messages followed by dubbed audio, SRT, and translated text."""
    outputs = (None, None, None)
    job_dir = None
    temp_dir = None
    try:
        if not audio_file:
            raise RuntimeError("Choose a media file and allow browser audio extraction before starting.")
        audio_path = Path(audio_file)
        if not audio_path.is_file():
            raise RuntimeError("The extracted audio expired. Re-select the media and retry.")
        if audio_path.stat().st_size > MAX_BYTES:
            raise RuntimeError("Extracted audio is over 200 MB. Choose a smaller clip.")
        if target_language not in LANGUAGES or source_language not in SOURCE_CODES:
            raise RuntimeError("Select a supported source and target language.")
        if voice_gender not in {"Female", "Male"}:
            raise RuntimeError("Select a voice gender.")
        rate = max(-20, min(20, int(speech_speed)))
        duration = _duration(audio_path)
        job_dir = OUTPUT_DIR / uuid.uuid4().hex
        job_dir.mkdir(parents=True, exist_ok=True)
        temp_dir = Path(tempfile.mkdtemp(prefix="opendub-"))

        yield "Transcribe: loading cached faster-whisper small model…", *outputs
        raw, detected = _transcribe(audio_path, source_language)
        rows = []
        for start, end, text in raw:
            start = min(start, duration)
            end = min(max(end, start + 0.05), duration)
            if end > start:
                rows.append((start, end, text))
        if not rows:
            raise RuntimeError("No speech was detected. Try a clearer clip with audible speech.")
        source_code = NLLB_CODES.get(detected)
        if not source_code:
            raise RuntimeError(
                f"Detected language '{detected}' is not supported by this translation model. "
                "Choose a source language manually and retry."
            )

        yield "Translate: NLLB-200 distilled 600M, batches of 16…", *outputs
        target_code = LANGUAGES[target_language][0]
        translated = _translate_batch([row[2] for row in rows], source_code, target_code)
        translated_rows = [
            (start, end, text or original)
            for (start, end, original), text in zip(rows, translated)
        ]
        voice = LANGUAGES[target_language][2 if voice_gender == "Female" else 3]

        yield "Voice: generating segments in parallel (maximum 8)…", *outputs
        voice_paths = asyncio.run(_synthesize([row[2] for row in translated_rows], voice, rate, temp_dir))
        from pydub import AudioSegment

        mixed = AudioSegment.silent(duration=round(duration * 1000), frame_rate=24000).set_channels(1)
        if keep_background:
            source_bed = AudioSegment.from_file(audio_path).set_frame_rate(24000).set_channels(1)
            source_bed = source_bed[:len(mixed)]
            if len(source_bed) < len(mixed):
                source_bed += AudioSegment.silent(duration=len(mixed) - len(source_bed), frame_rate=24000)
            mixed = source_bed.apply_gain(-18).overlay(mixed)

        yield "Sync: fitting each voice clip with FFmpeg atempo (maximum 1.6x)…", *outputs
        for (start, end, _), path in zip(translated_rows, voice_paths):
            slot_ms = max(80, round((end - start) * 1000))
            clip = AudioSegment.from_file(path)
            if len(clip) > slot_ms:
                factor = min(1.6, len(clip) / slot_ms)
                fitted = temp_dir / f"fit-{path.stem}.mp3"
                _run([
                    "ffmpeg", "-y", "-i", str(path), "-filter:a", _atempo_filter(factor),
                    "-codec:a", "libmp3lame", str(fitted),
                ], timeout=120)
                clip = AudioSegment.from_file(fitted)
            clip = clip.set_frame_rate(24000).set_channels(1)[:slot_ms]
            mixed = mixed.overlay(clip, position=round(start * 1000))

        yield "Export: writing MP3, SRT, and translated text…", *outputs
        stem = f"dub-{target_language.lower()}"
        mixed.export(temp_dir / "dubbed.wav", format="wav")
        mp3_path = job_dir / f"{stem}.mp3"
        _run(["ffmpeg", "-y", "-i", str(temp_dir / "dubbed.wav"), "-codec:a", "libmp3lame", "-q:a", "2", str(mp3_path)], timeout=300)
        srt_path = job_dir / f"{stem}.srt"
        _write_srt(translated_rows, srt_path)
        text_path = job_dir / f"{stem}.txt"
        text_path.write_text("\n\n".join(row[2] for row in translated_rows) + "\n", encoding="utf-8")

        yield f"Export: ready for local MP4 mux; {len(rows)} translated segments.", mp3_path, srt_path, text_path
    except Exception as exc:
        yield f"ERROR: {exc}\n\nSelect Retry to run the job again.", *outputs
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


def build_app():
    with gr.Blocks(title="OpenDub — Free AI Dubbing", theme=gr.themes.Soft(primary_hue="indigo")) as demo:
        gr.Markdown(
            "# 🎙️ OpenDub\nFree AI dubbing for short clips. Your browser extracts and keeps the original media local; "
            "only extracted audio is sent to this backend. The browser creates the final MP4."
        )
        audio = gr.File(label="Extracted mono WAV (max 200 MB, 10 minutes)", file_types=[".wav"], type="filepath")
        with gr.Row():
            source = gr.Dropdown(list(SOURCE_CODES), value="Auto-detect", label="Source language")
            target = gr.Dropdown(list(LANGUAGES), value="Hindi", label="Target language")
            gender = gr.Radio(["Female", "Male"], value="Female", label="Voice gender")
        with gr.Row():
            speed = gr.Slider(-20, 20, value=0, step=5, label="Voice rate (%)")
            background = gr.Checkbox(value=False, label="Keep original background audio (lowered under dub)")
        run = gr.Button("Create dub", variant="primary")
        status = gr.Markdown("Ready. Browser extraction and first-time model downloads may take a little time.")
        with gr.Row():
            audio_out = gr.File(label="Dubbed MP3")
            srt_out = gr.File(label="Subtitles (SRT)")
            text_out = gr.File(label="Translated text")
        run.click(
            dub_audio,
            [audio, target, source, gender, speed, background],
            [status, audio_out, srt_out, text_out],
            concurrency_limit=1,
            time_limit=7200,
        )
        gr.Markdown(
            "Privacy note: only extracted audio is uploaded to this backend. Edge TTS sends translated text to Microsoft's service. "
            "Temporary working files are deleted; completed output files remain in the outputs directory."
        )
    return demo


if __name__ == "__main__":
    app = build_app().queue(default_concurrency_limit=1, max_size=8)
    app.launch(
        server_name=os.getenv("HOST", "0.0.0.0"),
        server_port=int(os.getenv("PORT", "7860")),
        share=os.getenv("SHARE", "false").lower() == "true",
        show_error=True,
    )
