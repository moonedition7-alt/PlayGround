"""OpenDub: a single-file Gradio UI and AI dubbing pipeline."""
from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Any

import gradio as gr

OUTPUT_DIR = Path(os.getenv("OPENDUB_OUTPUT_DIR", Path(tempfile.gettempdir()) / "opendub-outputs")).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
MAX_BYTES = 200 * 1024 * 1024
MAX_SECONDS = 10 * 60
MAX_TTS_CONCURRENCY = 8
WHISPER_MODEL_NAME = "small"
TRANSLATION_MODEL_NAME = "facebook/nllb-200-distilled-600M"

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
SOURCE_LANGUAGES = {"Auto": None, **{name: data[1] for name, data in LANGUAGES.items()}}
NLLB_CODES = {data[1]: data[0] for data in LANGUAGES.values()}
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}

_whisper_lock = threading.Lock()
_whisper_models: dict[tuple[str, str, str], Any] = {}
_translator: tuple[Any, Any, Any] | None = None
_translation_lock = threading.Lock()


def _run(command: list[str], timeout: int = 900) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise RuntimeError("FFmpeg is missing. Install the system package `ffmpeg` and try again.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Media processing took too long. Try a shorter clip.") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout).strip().splitlines()
        message = detail[-1] if detail else "Unknown media processing error."
        raise RuntimeError(f"FFmpeg could not process this file: {message[-500:]}")
    return result


def _media_duration(path: Path) -> float:
    result = _run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ])
    try:
        duration = float(result.stdout.strip())
    except ValueError as exc:
        raise RuntimeError("The uploaded file's duration could not be read. Try another media file.") from exc
    if duration <= 0 or duration > MAX_SECONDS:
        raise RuntimeError("Please use a clip longer than zero and no more than 10 minutes.")
    return duration


def _has_video(path: Path) -> bool:
    result = _run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(path),
    ])
    return bool(result.stdout.strip())


def _cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:
        return False


def _transcribe(audio_path: Path, source_language: str) -> tuple[list[tuple[float, float, str]], str]:
    from faster_whisper import WhisperModel

    use_gpu = os.getenv("WHISPER_DEVICE", "cuda" if _cuda_available() else "cpu") == "cuda"
    device = "cuda" if use_gpu else "cpu"
    compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "float16" if use_gpu else "int8")
    cache_key = (WHISPER_MODEL_NAME, device, compute_type)
    with _whisper_lock:
        model = _whisper_models.get(cache_key)
        if model is None:
            model = WhisperModel(WHISPER_MODEL_NAME, device=device, compute_type=compute_type)
            _whisper_models[cache_key] = model
    language = SOURCE_LANGUAGES.get(source_language)
    segments, info = model.transcribe(str(audio_path), language=language, beam_size=1, vad_filter=True)
    rows = [
        (max(0.0, float(segment.start)), max(0.05, float(segment.end)), (segment.text or "").strip())
        for segment in segments if (segment.text or "").strip()
    ]
    return rows, info.language


def _get_translator() -> tuple[Any, Any, Any]:
    global _translator
    with _translation_lock:
        if _translator is None:
            import torch
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

            tokenizer = AutoTokenizer.from_pretrained(TRANSLATION_MODEL_NAME)
            model = AutoModelForSeq2SeqLM.from_pretrained(TRANSLATION_MODEL_NAME)
            if torch.cuda.is_available():
                model = model.to("cuda", dtype=torch.float16)
            model.eval()
            _translator = (tokenizer, model, torch)
    return _translator


def _translate_batch(texts: list[str], source_code: str, target_code: str) -> list[str]:
    tokenizer, model, torch = _get_translator()
    tokenizer.src_lang = source_code
    translated: list[str] = []
    device = next(model.parameters()).device
    for offset in range(0, len(texts), 16):
        encoded = tokenizer(texts[offset:offset + 16], return_tensors="pt", padding=True, truncation=True, max_length=512)
        encoded = {key: value.to(device) for key, value in encoded.items()}
        with torch.inference_mode():
            tokens = model.generate(
                **encoded,
                forced_bos_token_id=tokenizer.convert_tokens_to_ids(target_code),
                max_new_tokens=256,
                num_beams=2,
            )
        translated.extend(item.strip() for item in tokenizer.batch_decode(tokens, skip_special_tokens=True))
    return translated


def _srt_time(seconds: float) -> str:
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    whole, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{whole:02},{millis:03}"


def _write_srt(rows: list[tuple[float, float, str]], path: Path) -> None:
    entries = [
        f"{index}\n{_srt_time(start)} --> {_srt_time(end)}\n{text}"
        for index, (start, end, text) in enumerate(rows, 1)
    ]
    path.write_text("\n\n".join(entries) + "\n", encoding="utf-8")


async def _synthesize(texts: list[str], voice: str, rate: int, temp_dir: Path) -> list[Path]:
    import edge_tts

    semaphore = asyncio.Semaphore(MAX_TTS_CONCURRENCY)

    async def synthesize_one(index: int, text: str) -> Path:
        path = temp_dir / f"voice-{index:05}.mp3"
        async with semaphore:
            await edge_tts.Communicate(text, voice, rate=f"{rate:+d}%").save(str(path))
        return path

    return await asyncio.gather(*(synthesize_one(index, text) for index, text in enumerate(texts)))


def _set_progress(progress: gr.Progress, amount: float, stage: str) -> None:
    progress(amount, desc=stage)


def create_dub(
    media_file: str | None,
    source_language: str,
    target_language: str,
    voice_gender: str,
    speech_speed: float,
    keep_background: bool,
    progress: gr.Progress = gr.Progress(),
):
    """Run each pipeline stage and yield live UI status and final download paths."""
    empty_outputs = (None, None, None, "")
    temp_dir: Path | None = None
    generated_outputs: list[Path] = []
    completed = False
    try:
        if not media_file:
            raise RuntimeError("Upload a video or audio file to get started.")
        media_path = Path(media_file)
        if not media_path.is_file():
            raise RuntimeError("The uploaded file is no longer available. Please upload it again.")
        if media_path.suffix.lower() not in ALLOWED_EXTENSIONS:
            raise RuntimeError("Choose a supported video or audio file (MP4, MOV, MKV, MP3, WAV, or M4A).")
        if media_path.stat().st_size > MAX_BYTES:
            raise RuntimeError("This file is over 200 MB. Please choose a smaller file.")
        if source_language not in SOURCE_LANGUAGES or target_language not in LANGUAGES:
            raise RuntimeError("Choose one of the supported source and target languages.")
        if voice_gender not in {"Female", "Male"}:
            raise RuntimeError("Choose a voice gender.")

        temp_dir = Path(tempfile.mkdtemp(prefix="opendub-"))
        duration = _media_duration(media_path)
        extracted_audio = temp_dir / "source.wav"
        _set_progress(progress, 0.02, "Extract")
        yield "**Extract** — preparing your audio…", *empty_outputs
        _run([
            "ffmpeg", "-y", "-i", str(media_path), "-vn", "-ac", "1", "-ar", "16000",
            "-c:a", "pcm_s16le", str(extracted_audio),
        ], timeout=600)

        _set_progress(progress, 0.18, "Transcribe")
        yield "**Transcribe** — listening with faster-whisper small…", *empty_outputs
        raw_rows, detected_language = _transcribe(extracted_audio, source_language)
        rows = []
        for start, end, text in raw_rows:
            start = min(start, duration)
            end = min(max(end, start + 0.05), duration)
            if end > start:
                rows.append((start, end, text))
        if not rows:
            raise RuntimeError("No speech was detected. Try a clearer clip with audible speech.")
        selected_source_code = SOURCE_LANGUAGES[source_language] or detected_language
        source_code = NLLB_CODES.get(selected_source_code)
        if not source_code:
            raise RuntimeError(
                f"The detected language ({detected_language}) is not supported. Choose the source language manually and try again."
            )

        _set_progress(progress, 0.38, "Translate")
        yield "**Translate** — translating the speech…", *empty_outputs
        target_code = LANGUAGES[target_language][0]
        translated_texts = _translate_batch([row[2] for row in rows], source_code, target_code)
        translated_rows = [
            (start, end, text or original)
            for (start, end, original), text in zip(rows, translated_texts)
        ]

        _set_progress(progress, 0.58, "Voice")
        yield "**Voice** — creating the selected AI voice…", *empty_outputs
        voice = LANGUAGES[target_language][2 if voice_gender == "Female" else 3]
        rate = round((float(speech_speed) - 1.0) * 100)
        voice_paths = asyncio.run(_synthesize([row[2] for row in translated_rows], voice, rate, temp_dir))

        _set_progress(progress, 0.74, "Sync")
        yield "**Sync** — fitting speech to its original timestamps…", *empty_outputs
        from pydub import AudioSegment

        mixed = AudioSegment.silent(duration=round(duration * 1000), frame_rate=24000).set_channels(1)
        if keep_background:
            background = AudioSegment.from_file(extracted_audio).set_frame_rate(24000).set_channels(1)
            background = background[:len(mixed)]
            if len(background) < len(mixed):
                background += AudioSegment.silent(duration=len(mixed) - len(background), frame_rate=24000)
            mixed = background.apply_gain(-18)

        for (start, end, _), voice_path in zip(translated_rows, voice_paths):
            slot_ms = max(80, round((end - start) * 1000))
            clip = AudioSegment.from_file(voice_path)
            if len(clip) > slot_ms:
                factor = min(1.6, len(clip) / slot_ms)
                fitted_path = temp_dir / f"fit-{voice_path.stem}.mp3"
                _run([
                    "ffmpeg", "-y", "-i", str(voice_path), "-filter:a", f"atempo={factor:.5f}",
                    "-codec:a", "libmp3lame", str(fitted_path),
                ], timeout=120)
                clip = AudioSegment.from_file(fitted_path)
            clip = clip.set_frame_rate(24000).set_channels(1)[:slot_ms]
            mixed = mixed.overlay(clip, position=round(start * 1000))

        _set_progress(progress, 0.88, "Export")
        yield "**Export** — saving your dubbed media and subtitles…", *empty_outputs
        output_id = uuid.uuid4().hex
        stem = f"opendub-{target_language.lower()}-{output_id}"
        wav_path = temp_dir / "dubbed.wav"
        mixed.export(wav_path, format="wav")
        mp3_path = OUTPUT_DIR / f"{stem}.mp3"
        generated_outputs.append(mp3_path)
        _run(["ffmpeg", "-y", "-i", str(wav_path), "-codec:a", "libmp3lame", "-q:a", "2", str(mp3_path)], timeout=300)

        mp4_path = OUTPUT_DIR / f"{stem}.mp4"
        generated_outputs.append(mp4_path)
        if _has_video(media_path):
            _run([
                "ffmpeg", "-y", "-i", str(media_path), "-i", str(mp3_path),
                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                "-movflags", "+faststart", str(mp4_path),
            ], timeout=600)
        else:
            _run([
                "ffmpeg", "-y", "-i", str(mp3_path), "-vn", "-c:a", "aac",
                "-movflags", "+faststart", str(mp4_path),
            ], timeout=300)

        srt_path = OUTPUT_DIR / f"{stem}.srt"
        generated_outputs.append(srt_path)
        _write_srt(translated_rows, srt_path)
        translated_text = "\n\n".join(row[2] for row in translated_rows)
        _set_progress(progress, 1.0, "Complete")
        completed = True
        yield f"**Done!** Your dubbed files are ready ({len(translated_rows)} speech segments).", mp4_path, mp3_path, srt_path, translated_text
    except Exception as exc:
        message = str(exc).strip() or "The dubbing job could not be completed. Please try again."
        yield f"**Couldn't create the dub.** {message}\n\nCheck your connection and try a shorter or clearer clip.", *empty_outputs
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
        if not completed:
            for output_path in generated_outputs:
                output_path.unlink(missing_ok=True)


def build_app() -> gr.Blocks:
    css = """
    :root { --opendub-purple: #6b4eff; --opendub-ink: #29233f; --opendub-muted: #716b83; }
    body, .gradio-container { background: #f7f5ff !important; color: var(--opendub-ink); }
    .gradio-container { max-width: 900px !important; margin: auto !important; padding: 18px !important; }
    #hero { background: linear-gradient(135deg,#fff 0%,#f0ebff 100%); border: 1px solid #e6defe; border-radius: 24px; padding: 22px; margin-bottom: 14px; }
    #hero h1 { color: #4e38c8; font-size: clamp(1.7rem,6vw,2.4rem); margin-bottom: 8px; }
    .panel { background: white; border: 1px solid #e9e4f4; border-radius: 20px; padding: 16px; }
    button.primary { background: var(--opendub-purple) !important; border: 0 !important; min-height: 52px; font-size: 1.05rem !important; }
    #status { color: var(--opendub-muted); min-height: 30px; }
    footer { display: none !important; }
    @media (max-width: 640px) { .gradio-container { padding: 10px !important; } #hero { padding: 17px; border-radius: 18px; } .panel { padding: 12px; } }
    """
    with gr.Blocks(title="OpenDub: Free AI video dubbing", theme=gr.themes.Soft(primary_hue="purple"), css=css) as app:
        gr.Markdown(
            "# OpenDub: Free AI video dubbing\nUpload a video or audio clip, choose a language and voice, then create a dubbed download.",
            elem_id="hero",
        )
        with gr.Group(elem_classes=["panel"]):
            media = gr.File(
                label="Video or audio file (up to 200 MB and 10 minutes)",
                file_types=sorted(ALLOWED_EXTENSIONS),
                type="filepath",
            )
            with gr.Row():
                source = gr.Dropdown(list(SOURCE_LANGUAGES), value="Auto", label="Source language")
                target = gr.Dropdown(list(LANGUAGES), value="Hindi", label="Target language")
            with gr.Row():
                gender = gr.Radio(["Female", "Male"], value="Female", label="Voice gender")
                speed = gr.Slider(0.8, 1.2, value=1.0, step=0.05, label="Speech speed")
            background = gr.Checkbox(value=False, label="Keep original background audio under the dub")
            run_button = gr.Button("Create dub", variant="primary")
        status = gr.Markdown("Ready when you are. The first run may take longer while AI models download.", elem_id="status")
        with gr.Group(elem_classes=["panel"]):
            mp4_output = gr.Video(label="Dubbed MP4", format="mp4")
            with gr.Row():
                mp3_output = gr.File(label="Dubbed MP3")
                srt_output = gr.File(label="Subtitles (SRT)")
            text_output = gr.Textbox(label="Translated text", lines=8, interactive=False)
        gr.Markdown(
            "Temporary processing files are removed after each job. Edge TTS needs internet access and sends translated text to Microsoft's speech service."
        )
        run_button.click(
            create_dub,
            inputs=[media, source, target, gender, speed, background],
            outputs=[status, mp4_output, mp3_output, srt_output, text_output],
            concurrency_limit=1,
            time_limit=7200,
        )
    return app


if __name__ == "__main__":
    build_app().queue(default_concurrency_limit=1, max_size=8).launch(
        server_name=os.getenv("HOST", "0.0.0.0"),
        server_port=int(os.getenv("PORT", "7860")),
        share=os.getenv("SHARE", "false").lower() == "true",
        show_error=True,
    )
