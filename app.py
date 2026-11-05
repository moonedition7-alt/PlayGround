"""Local, free-to-run video dubbing MVP (Gradio).

Pipeline: FFmpeg -> optional Demucs -> faster-whisper -> NLLB-200 -> edge-tts
-> time fitting/mix -> FFmpeg MP4 mux. Models are downloaded on first use.
"""
from __future__ import annotations

import asyncio
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Iterator

import gradio as gr

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", ROOT / "outputs")).resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
MAX_SECONDS = 3600
LANGUAGES = {
    "Hindi": ("hin_Deva", "hi-IN-SwaraNeural", "hi"),
    "Kannada": ("kan_Knda", "kn-IN-SapnaNeural", "kn"),
    "Tamil": ("tam_Taml", "ta-IN-PallaviNeural", "ta"),
    "Telugu": ("tel_Telu", "te-IN-ShrutiNeural", "te"),
    "Malayalam": ("mal_Mlym", "ml-IN-SobhanaNeural", "ml"),
    "Marathi": ("mar_Deva", "mr-IN-AarohiNeural", "mr"),
    "Bengali": ("ben_Beng", "bn-IN-TanishaaNeural", "bn"),
    "Gujarati": ("guj_Gujr", "gu-IN-DhwaniNeural", "gu"),
    "Punjabi": ("pan_Guru", "pa-IN-VaaniNeural", "pa"),
    "Odia": ("ory_Orya", "or-IN-SubhasiniNeural", "or"),
    "Urdu": ("urd_Arab", "ur-PK-UzmaNeural", "ur"),
    "English": ("eng_Latn", "en-US-AriaNeural", "en"),
}
# NLLB uses FLORES-200 language identifiers.
NLLB_CODES = {
    "en": "eng_Latn", "eng": "eng_Latn", "hi": "hin_Deva", "hin": "hin_Deva",
    "kn": "kan_Knda", "kan": "kan_Knda", "ta": "tam_Taml", "tam": "tam_Taml",
    "te": "tel_Telu", "tel": "tel_Telu", "ml": "mal_Mlym", "mal": "mal_Mlym",
    "mr": "mar_Deva", "mar": "mar_Deva", "bn": "ben_Beng", "ben": "ben_Beng",
    "gu": "guj_Gujr", "guj": "guj_Gujr", "pa": "pan_Guru", "pan": "pan_Guru",
    "or": "ory_Orya", "ory": "ory_Orya", "ur": "urd_Arab", "urd": "urd_Arab",
    "es": "spa_Latn", "spa": "spa_Latn", "fr": "fra_Latn", "fra": "fra_Latn",
    "de": "deu_Latn", "deu": "deu_Latn", "it": "ita_Latn", "ita": "ita_Latn",
    "pt": "por_Latn", "por": "por_Latn", "ru": "rus_Cyrl", "rus": "rus_Cyrl",
    "zh": "zho_Hans", "zho": "zho_Hans", "ja": "jpn_Jpan", "jpn": "jpn_Jpan",
    "ko": "kor_Hang", "kor": "kor_Hang", "ar": "arb_Arab", "ara": "arb_Arab",
    "nl": "nld_Latn", "nld": "nld_Latn", "tr": "tur_Latn", "tur": "tur_Latn",
}
WHISPER_LANGUAGES = {
    "English": "en", "Hindi": "hi", "Kannada": "kn", "Tamil": "ta", "Telugu": "te",
    "Malayalam": "ml", "Marathi": "mr", "Bengali": "bn", "Gujarati": "gu",
    "Punjabi": "pa", "Odia": "or", "Urdu": "ur",
}


def _run(command: list[str], *, timeout: int | None = None) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as exc:
        raise RuntimeError(f"Required program not found: {command[0]}. Install FFmpeg and add it to PATH.") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("A media processing step timed out. Try a shorter file or a machine with more memory.") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout)[-2500:]
        raise RuntimeError(f"Command failed ({command[0]}):\n{detail}")
    return result


def _duration(path: str | Path) -> float:
    result = _run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)
    ])
    try:
        duration = float(result.stdout.strip())
    except ValueError as exc:
        raise RuntimeError("Could not read the media duration. Check that the uploaded file is valid.") from exc
    if duration <= 0 or duration > MAX_SECONDS:
        raise RuntimeError("Files must be longer than zero and no more than 60 minutes.")
    return duration


def _has_video(path: str | Path) -> bool:
    result = _run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(path)])
    return bool(result.stdout.strip())


def _transcribe(audio_path: Path, model_name: str, language: str):
    from faster_whisper import WhisperModel

    compute = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    device = os.getenv("WHISPER_DEVICE", "cpu")
    model = WhisperModel(model_name, device=device, compute_type=compute)
    selected = None if language == "Auto-detect" else WHISPER_LANGUAGES.get(language)
    if language != "Auto-detect" and selected is None:
        raise RuntimeError(f"Unsupported source language: {language}")
    segments, info = model.transcribe(str(audio_path), language=selected, word_timestamps=True, vad_filter=True)
    # Consume the lazy generator while the model is in scope.
    raw = [(float(s.start), float(s.end), (s.text or "").strip()) for s in segments if (s.text or "").strip()]
    return raw, info.language


def _sentence_segments(raw: list[tuple[float, float, str]], duration: float):
    """Merge Whisper chunks into sentence-sized dubbing slots without overlap."""
    merged: list[list[float | str]] = []
    for start, end, text in raw:
        start = max(0.0, min(start, duration))
        end = max(start + 0.05, min(end, duration))
        if merged and not re.search(r"[.!?。！？…]$", str(merged[-1][2])) and start - float(merged[-1][1]) < 0.8:
            merged[-1][1] = max(float(merged[-1][1]), end)
            merged[-1][2] = (str(merged[-1][2]) + " " + text).strip()
        else:
            merged.append([start, end, text])
    clean = []
    previous_end = 0.0
    for start, end, text in merged:
        start = max(float(start), previous_end)
        end = max(start + 0.08, float(end))
        end = min(duration, end)
        if end > start and str(text).strip():
            clean.append((start, end, str(text).strip()))
            previous_end = end
    return clean


_TRANSLATOR = None


def _get_translator():
    global _TRANSLATOR
    if _TRANSLATOR is None:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        import torch

        name = os.getenv("TRANSLATION_MODEL", "facebook/nllb-200-distilled-600M")
        _TRANSLATOR = (AutoTokenizer.from_pretrained(name), AutoModelForSeq2SeqLM.from_pretrained(name), torch)
    return _TRANSLATOR


def _translate_piece(text: str, source_code: str, target_code: str) -> str:
    if not text.strip():
        return text
    tokenizer, model, torch = _get_translator()
    tokenizer.src_lang = source_code
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    target_id = tokenizer.convert_tokens_to_ids(target_code)
    with torch.inference_mode():
        output = model.generate(**inputs, forced_bos_token_id=target_id, max_new_tokens=256, num_beams=3)
    return tokenizer.batch_decode(output, skip_special_tokens=True)[0].strip()


def _translate(text: str, source_code: str, target_code: str, glossary: list[str]) -> str:
    # Translate around glossary matches rather than asking the model to copy names/numbers.
    terms = [term.strip() for term in glossary if term.strip()]
    if not terms:
        return _translate_piece(text, source_code, target_code)
    pattern = re.compile("(" + "|".join(re.escape(t) for t in sorted(terms, key=len, reverse=True)) + ")", re.IGNORECASE)
    chunks = pattern.split(text)
    result = []
    for chunk in chunks:
        if not chunk:
            continue
        if pattern.fullmatch(chunk):
            result.append(chunk)
            continue
        # Keep the original separators around copied glossary terms; joining
        # translated fragments with added spaces can separate punctuation.
        leading = chunk[:len(chunk) - len(chunk.lstrip())]
        trailing = chunk[len(chunk.rstrip()):]
        content = chunk.strip()
        translated = _translate_piece(content, source_code, target_code) if content else ""
        result.append(leading + (translated or content) + trailing)
    return "".join(result).strip()


def _edge_voice(text: str, voice: str, rate: int, output_path: Path):
    import edge_tts

    async def save():
        await edge_tts.Communicate(text, voice, rate=f"{rate:+d}%").save(str(output_path))

    asyncio.run(save())


def _srt_time(seconds: float) -> str:
    millis = max(0, round(seconds * 1000))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    seconds_i, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{seconds_i:02},{millis:03}"


def _write_subtitles(rows, path: Path, vtt: bool = False):
    blocks = []
    for index, (start, end, _, translated) in enumerate(rows, 1):
        begin = _srt_time(start).replace(",", ".") if vtt else _srt_time(start)
        finish = _srt_time(end).replace(",", ".") if vtt else _srt_time(end)
        cue = f"{begin} --> {finish}\n{translated}"
        blocks.append(cue if vtt else f"{index}\n{cue}")
    path.write_text(("WEBVTT\n\n" if vtt else "") + "\n\n".join(blocks) + "\n", encoding="utf-8")


def dub_media(media_file, target_language: str, source_language: str, speaker_gender: str,
              speech_speed: int, keep_music: bool, glossary_text: str, whisper_model: str) -> Iterator:
    """Gradio generator: yields progress text and then all deliverables."""
    if media_file is None:
        yield "Upload a video or audio file first.", None, None, None, None, None
        return
    source_path = Path(media_file)
    if not source_path.is_file():
        yield "The uploaded file is no longer available. Please upload it again.", None, None, None, None, None
        return
    if source_path.stat().st_size > 2 * 1024**3:
        yield "The upload exceeds the 2 GB limit. Choose a smaller file.", None, None, None, None, None
        return
    if target_language not in LANGUAGES:
        yield "Select a supported target language.", None, None, None, None, None
        return

    job_dir = OUTPUT_DIR / uuid.uuid4().hex
    job_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="dub-")).resolve()
    try:
        yield "**1/7 — Extracting audio…**", None, None, None, None, None
        duration = _duration(source_path)
        audio = temp_dir / "source.wav"
        _run(["ffmpeg", "-y", "-i", str(source_path), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(audio)], timeout=900)

        background = None
        if keep_music:
            yield "**2/7 — Separating vocals and background (Demucs)…** First run downloads model weights.", None, None, None, None, None
            demucs_out = temp_dir / "separated"
            demucs_input = temp_dir / "demucs-source.wav"
            _run(["ffmpeg", "-y", "-i", str(source_path), "-vn", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", str(demucs_input)], timeout=900)
            _run([os.getenv("PYTHON", sys.executable), "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs", "-o", str(demucs_out), str(demucs_input)], timeout=7200)
            candidates = list(demucs_out.glob("**/no_vocals.wav"))
            if not candidates:
                raise RuntimeError("Demucs finished but its background stem was not found. Try disabling background preservation.")
            background = candidates[0]

        yield "**3/7 — Transcribing speech with word timestamps…**", None, None, None, None, None
        raw, detected = _transcribe(audio, whisper_model, source_language)
        segments = _sentence_segments(raw, duration)
        if not segments:
            raise RuntimeError("No speech was detected. Try a clearer recording or another Whisper model.")

        source_code = NLLB_CODES.get(detected)
        if not source_code:
            raise RuntimeError(f"Detected language '{detected}' is not supported by the included NLLB model. Select a supported source language or provide a different recording.")
        target_code, base_voice, _ = LANGUAGES[target_language]
        voice = base_voice
        if speaker_gender == "Male":
            voice_map = {
                "Hindi": "hi-IN-MadhurNeural", "Kannada": "kn-IN-GaganNeural", "Tamil": "ta-IN-ValluvarNeural",
                "Telugu": "te-IN-MohanNeural", "Malayalam": "ml-IN-MidhunNeural", "Marathi": "mr-IN-ManoharNeural",
                "Bengali": "bn-IN-BashkarNeural", "Gujarati": "gu-IN-NiranjanNeural", "Punjabi": "pa-IN-OjasNeural",
                "Odia": "or-IN-PrabhatNeural", "Urdu": "ur-PK-AsadNeural", "English": "en-US-GuyNeural",
            }
            voice = voice_map.get(target_language, base_voice)
        glossary = [t.strip() for t in re.split(r"[,\n]", glossary_text or "") if t.strip()]

        yield "**4/7 — Translating segments…** The first run downloads the open translation model (~2.5 GB).", None, None, None, None, None
        translated_rows = []
        for start, end, original in segments:
            translated = _translate(original, source_code, target_code, glossary)
            translated_rows.append((start, end, original, translated or original))

        yield "**5/7 — Generating target speech…** edge-tts requires an internet connection and is free to use.", None, None, None, None, None
        from pydub import AudioSegment
        from pydub.effects import normalize

        speech_track = AudioSegment.silent(duration=round(duration * 1000), frame_rate=24000).set_channels(1)
        for index, (start, end, original, translated) in enumerate(translated_rows):
            generated = temp_dir / f"voice-{index:05}.mp3"
            slot_ms = max(80, round((end - start) * 1000))
            # If speech cannot fit at 1.25x, shorten the translation and synthesize again.
            # This keeps neighboring segments from overlapping and subtitles match the delivered audio.
            for attempt in range(6):
                _edge_voice(translated, voice, int(speech_speed), generated)
                clip = AudioSegment.from_file(generated).set_frame_rate(24000).set_channels(1)
                if len(clip) <= slot_ms or attempt == 5:
                    break
                ratio = len(clip) / slot_ms
                if ratio <= 1.25:
                    fitted = temp_dir / f"fit-{index:05}.wav"
                    _run(["ffmpeg", "-y", "-i", str(generated), "-filter:a", f"atempo={ratio:.5f}", "-t", f"{slot_ms/1000:.3f}", str(fitted)])
                    clip = AudioSegment.from_file(fitted).set_frame_rate(24000).set_channels(1)[:slot_ms]
                    break
                words = translated.split()
                if len(words) <= 3:
                    fitted = temp_dir / f"fit-{index:05}.wav"
                    _run(["ffmpeg", "-y", "-i", str(generated), "-filter:a", "atempo=1.25", "-t", f"{slot_ms/1000:.3f}", str(fitted)])
                    clip = AudioSegment.from_file(fitted).set_frame_rate(24000).set_channels(1)[:slot_ms]
                    break
                translated = " ".join(words[:max(3, int(len(words) * 0.8))]).rstrip(" ,;:")
                translated_rows[index] = (start, end, original, translated)
            if len(clip) > slot_ms:
                clip = clip[:slot_ms]
            speech_track = speech_track.overlay(clip, position=round(start * 1000))

        yield "**6/7 — Fitting timing and mixing audio…**", None, None, None, None, None
        if background:
            bed = AudioSegment.from_file(background).set_frame_rate(24000).set_channels(1)
            if len(bed) < len(speech_track):
                bed += AudioSegment.silent(duration=len(speech_track) - len(bed), frame_rate=24000)
            bed = bed[:len(speech_track)]
            # Reduce peaks before overlay to leave headroom and avoid integer-sample clipping.
            mixed = bed.apply_gain(-8).overlay(normalize(speech_track).apply_gain(-3))
        else:
            mixed = speech_track
        mixed_path = temp_dir / "mixed.wav"
        mixed.export(mixed_path, format="wav")
        mp3_path = job_dir / f"{source_path.stem}-{target_language.lower()}-dub.mp3"
        _run(["ffmpeg", "-y", "-i", str(mixed_path), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-codec:a", "libmp3lame", "-q:a", "2", str(mp3_path)])
        srt_path = job_dir / f"{source_path.stem}-{target_language.lower()}.srt"
        vtt_path = job_dir / f"{source_path.stem}-{target_language.lower()}.vtt"
        _write_subtitles(translated_rows, srt_path)
        _write_subtitles(translated_rows, vtt_path, vtt=True)

        yield "**7/7 — Muxing dubbed video…**", None, None, None, None, None
        mp4_path = job_dir / f"{source_path.stem}-{target_language.lower()}-dub.mp4"
        if _has_video(source_path):
            _run(["ffmpeg", "-y", "-i", str(source_path), "-i", str(mp3_path), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(mp4_path)], timeout=1800)
        else:
            _run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=1280x720:r=25", "-i", str(mp3_path), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k", "-shortest", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(mp4_path)], timeout=1800)

        transcript = "\n\n".join(f"{_srt_time(a)} → {_srt_time(b)}\n{src}\n→ {dst}" for a, b, src, dst in translated_rows)
        yield f"✅ **Done.** Detected source: `{detected}` · {len(translated_rows)} segments · {duration/60:.1f} minutes", mp4_path, mp3_path, srt_path, vtt_path, transcript
    except Exception as exc:
        message = str(exc)
        yield f"❌ **Dubbing failed:** {message}\n\nCheck the setup guide for FFmpeg/model requirements, then retry with a shorter file.", None, None, None, None, None
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def build_app():
    with gr.Blocks(title="OpenDub — Free Video Dubbing", theme=gr.themes.Soft(primary_hue="indigo", neutral_hue="slate")) as demo:
        gr.Markdown("# 🎙️ OpenDub\n### Free, open-source video dubbing — runs on your machine")
        gr.Markdown("Upload media, choose one target language, and create dubbed video, MP3, SRT and VTT files. The first run downloads the selected speech and translation models. **No API keys or paid services.**")
        with gr.Row():
            media = gr.File(label="Video or audio (up to 60 minutes)", file_types=["video", "audio"], type="filepath")
            with gr.Column():
                source = gr.Dropdown(["Auto-detect", "English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Odia", "Urdu"], value="Auto-detect", label="Source language")
                target = gr.Dropdown(list(LANGUAGES), value="Hindi", label="Target language")
                gender = gr.Radio(["Female", "Male"], value="Female", label="Generated voice")
        with gr.Accordion("Advanced options", open=False):
            with gr.Row():
                keep_music = gr.Checkbox(value=False, label="Preserve background music (requires Demucs; slow on CPU)")
                speed = gr.Slider(-20, 20, value=0, step=5, label="Speech speed (%)")
                model = gr.Dropdown(["tiny", "base", "small", "medium", "large-v3"], value="small", label="Whisper model (larger = better, slower)")
            glossary = gr.Textbox(label="Keep untranslated (comma-separated names, brands, numbers)", placeholder="OpenAI, Acme, 2025")
        create = gr.Button("✨ Create dub", variant="primary", size="lg")
        status = gr.Markdown("Ready when you are.")
        with gr.Row():
            video_out = gr.Video(label="Dubbed MP4")
            audio_out = gr.Audio(label="Dubbed MP3", type="filepath")
        with gr.Row():
            srt_out = gr.File(label="Subtitles (SRT)")
            vtt_out = gr.File(label="Subtitles (VTT)")
        transcript = gr.Textbox(label="Transcript and translation", lines=12, interactive=False)
        create.click(dub_media, [media, target, source, gender, speed, keep_music, glossary, model], [status, video_out, audio_out, srt_out, vtt_out, transcript], concurrency_limit=1)
        gr.Markdown("---\n**Privacy:** media is processed locally and temporary working files are deleted after each job. Completed downloads remain in `outputs/`. Translation models and Edge TTS are subject to their upstream licenses and service terms.")
    return demo


if __name__ == "__main__":
    build_app().queue(default_concurrency_limit=1, max_size=8).launch(server_name=os.getenv("HOST", "127.0.0.1"), server_port=int(os.getenv("PORT", "7860")), share=False)
