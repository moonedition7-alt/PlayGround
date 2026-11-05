---
title: OpenDub
emoji: 🎙️
colorFrom: indigo
colorTo: purple
sdk: gradio
app_file: app.py
pinned: false
---

# OpenDub — free AI video dubbing

OpenDub is one Gradio app: the page and the full dubbing pipeline run together in `app.py`. Upload a video or audio clip, choose source and target languages, voice gender, speech speed, and whether to retain lowered background audio. Download the dubbed MP4, MP3, SRT subtitles, and translated text.

Supported languages: Hindi, Kannada, Tamil, Telugu, Malayalam, Marathi, Bengali, Gujarati, and English. The pipeline uses faster-whisper `small` (beam size 1 with VAD), NLLB-200 distilled 600M (batches of 16 and two beams), Edge TTS (at most eight concurrent segments), FFmpeg, and pydub. GPU inference uses float16 where supported. FFmpeg copies the original video stream when exporting video. Temporary job files are removed after processing.

Edge TTS requires internet and sends translated text to Microsoft's speech service. Keeping background audio lowers the original audio under the new voice; it does not separate original speech from music. First-time model downloads can take several minutes. Use short clips (up to 10 minutes and 200 MB). Public Gradio share links and public Spaces are accessible to anyone with the link; avoid uploading private media.

## Hugging Face Spaces

The repository is ready to use as a Gradio Space. `README.md` contains the Space metadata, `requirements.txt` contains Python dependencies, and `packages.txt` installs FFmpeg and libsndfile. For faster processing, use a GPU Space with sufficient memory. The app can also run locally with Python 3.11+, FFmpeg/ffprobe, and `python app.py`.

## Five-step phone guide (Google Colab)

1. Open [`opendub_colab.ipynb`](https://colab.research.google.com/github/moonedition7-alt/PlayGround/blob/main/opendub_colab.ipynb) in Google Colab on your phone. Sign in to your Google account.
2. In Colab, open **Runtime → Change runtime type** and choose a T4 GPU if one is available. A GPU is recommended; the free GPU option may not always be offered.
3. Run the first notebook cell and wait for installation to finish. Keep the Colab tab open.
4. Run the second cell. Wait while Gradio starts and prints a public link; leave that cell running.
5. On the OpenDub page, upload a video or audio clip, choose the dubbing options, tap **Create dub**, and download the results. On your phone, open the gradio.live link
