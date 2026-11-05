"""Single-file Gradio MVP for local audio/video dubbing."""
from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

import gradio as gr

from backend.pipeline import LANGUAGES, PipelineError, process_media


def dub_media(
    media: str | None,
    source_language: str,
    target_language: str,
    voice_gender: str,
    speech_speed: float,
    keep_music: bool,
    burn_subtitles: bool,
    glossary: str,
) -> tuple[str, str | None, str | None, str | None, str | None, str]:
    if not media:
        raise gr.Error("Upload an audio or video file first.")
    source = Path(media)
    job_dir = Path(tempfile.mkdtemp(prefix="voxora-gradio-"))
    input_path = job_dir / f"input{source.suffix.lower()}"
    shutil.copyfile(source, input_path)
    output_dir = job_dir / "outputs"
    try:
        result: dict[str, Any] = process_media(
            input_path,
            output_dir,
            source_language,
            [target_language],
            {
                "speakers": 1,
                "keep_music": keep_music,
                "voice_gender": voice_gender,
                "speech_speed": speech_speed,
                "burn_subtitles": burn_subtitles,
                "glossary": glossary,
            },
        )
        files = result["outputs"][target_language]
        # Return named files from a persistent directory; Gradio serves them for download.
        transcript = "\n".join(
            f"[{segment['start']:.2f}–{segment['end']:.2f}] {segment['text']}\n"
            f"→ {segment['translation'][target_language]}"
            for segment in result["segments"]
        )
        return (
            transcript,
            files.get("mp4"),
            files.get("mp3"),
            files.get("srt"),
            files.get("vtt"),
            f"Detected source language: {result['detected_language']}",
        )
    except PipelineError as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise gr.Error(str(exc)) from exc
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise gr.Error(f"Dubbing failed: {exc}") from exc


with gr.Blocks(title="Voxora — Open Dubbing Studio", theme=gr.themes.Soft()) as demo:
    gr.Markdown(
        "# Voxora Dubbing Studio\n"
        "Free, local-first audio and video dubbing. Models download on first use; "
        "Edge TTS needs an internet connection."
    )
    with gr.Row():
        with gr.Column(scale=1):
            media = gr.File(
                label="Audio or video file",
                file_count="single",
                type="filepath",
                file_types=[".mp4", ".mov", ".mkv", ".webm", ".avi", ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"],
            )
            source = gr.Dropdown(["Auto-detect", *LANGUAGES], value="Auto-detect", label="Source language")
            target = gr.Dropdown(list(LANGUAGES), value="Hindi", label="Dub into")
            gender = gr.Radio(["Female", "Male"], value="Female", label="Generated voice")
            speed = gr.Slider(0.75, 1.25, value=1, step=0.05, label="Speech speed")
            keep_music = gr.Checkbox(value=False, label="Preserve background music (requires Demucs)")
            burn = gr.Checkbox(value=False, label="Burn subtitles into video")
            glossary = gr.Textbox(label="Glossary (comma-separated, optional)")
            run_button = gr.Button("Create dub", variant="primary")
        with gr.Column(scale=2):
            status = gr.Markdown()
            transcript = gr.Textbox(label="Transcript and translation", lines=12, interactive=False)
            video = gr.Video(label="Dubbed video")
            audio = gr.Audio(label="Dubbed audio", type="filepath")
            with gr.Row():
                srt = gr.File(label="Download SRT")
                vtt = gr.File(label="Download VTT")
    run_button.click(
        dub_media,
        inputs=[media, source, target, gender, speed, keep_music, burn, glossary],
        outputs=[transcript, video, audio, srt, vtt, status],
    )
    gr.Markdown(
        "**Limits:** 2 GB / 60 minutes per file. Voice cloning is not included. "
        "Use only voices and media you have rights to use."
    )

if __name__ == "__main__":
    demo.queue().launch(server_name="0.0.0.0", server_port=7860)
