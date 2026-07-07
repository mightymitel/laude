"""Stage 1 — download: YouTube video -> audio.wav + video.mp4 + info.json."""
from __future__ import annotations

from pathlib import Path

import yt_dlp

from .util import write_json


def stage_download(url: str, work: Path) -> dict:
    info_path = work / "info.json"
    audio_path = work / "audio.wav"
    video_path = work / "video.mp4"
    work.mkdir(parents=True, exist_ok=True)

    if info_path.exists() and audio_path.exists() and video_path.exists():
        print("download: cached")
        from .util import read_json

        return read_json(info_path)

    # Audio: best audio -> 44.1k stereo wav (post-processed by ffmpeg).
    audio_opts = {
        "format": "bestaudio/best",
        "outtmpl": str(work / "audio.%(ext)s"),
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "wav"},
        ],
        "postprocessor_args": ["-ar", "44100"],
        "noplaylist": True,
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(audio_opts) as ydl:
        meta = ydl.extract_info(url, download=True)

    # Video (for lyric OCR): <=720p, mp4.
    video_opts = {
        "format": "bestvideo[height<=720][ext=mp4]/best[height<=720]",
        "outtmpl": str(work / "video.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(video_opts) as ydl:
        ydl.extract_info(url, download=True)

    info = {
        "youtube_id": meta["id"],
        "title": meta.get("title", meta["id"]),
        "channel": meta.get("channel", ""),
        "duration_s": float(meta.get("duration") or 0),
        "url": url,
    }
    write_json(info_path, info)
    print(f"download: {info['title']} ({info['duration_s']:.0f}s)")
    return info
