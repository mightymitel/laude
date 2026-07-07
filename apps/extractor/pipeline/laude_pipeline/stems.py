"""Stage 3 — stems: Demucs 4-stem separation (GPU) + ogg encodes + mixdown +
pitch-shifted key variants (±1, ±2 semitones; drums excluded per the spec).

Key variants use ffmpeg's asetrate+atempo trick — instant and dependency-free;
quality is MVP-grade (the real pipeline upgrades to rubberband).
"""
from __future__ import annotations

import shutil
from pathlib import Path

from .util import run

STEMS = ["vocals", "bass", "drums", "other"]
PITCHED_STEMS = ["vocals", "bass", "other"]
VARIANT_SEMITONES = [-2, -1, 1, 2]


def stage_stems(work: Path) -> None:
    stems_dir = work / "stems"
    variants_dir = work / "variants"
    mixdown = work / "mixdown.ogg"
    if stems_dir.exists() and mixdown.exists() and variants_dir.exists():
        print("stems: cached")
        return

    demucs_out = work / "demucs"
    separated = demucs_out / "htdemucs" / "audio"
    if not separated.exists():
        print("stems: running demucs (GPU)…")
        run([
            "python", "-m", "demucs",
            "-n", "htdemucs",
            "-o", str(demucs_out),
            str(work / "audio.wav"),
        ])

    stems_dir.mkdir(exist_ok=True)
    for stem in STEMS:
        encode_ogg(separated / f"{stem}.wav", stems_dir / f"{stem}.ogg")

    encode_ogg(work / "audio.wav", mixdown)

    variants_dir.mkdir(exist_ok=True)
    for stem in PITCHED_STEMS:
        for semitones in VARIANT_SEMITONES:
            out = variants_dir / f"{stem}{semitones:+d}.ogg"
            if not out.exists():
                pitch_shift_ogg(separated / f"{stem}.wav", out, semitones)

    shutil.rmtree(demucs_out, ignore_errors=True)
    print(f"stems: 4 stems + mixdown + {len(PITCHED_STEMS) * len(VARIANT_SEMITONES)} key variants")


def encode_ogg(src: Path, dst: Path) -> None:
    if dst.exists():
        return
    run(["ffmpeg", "-y", "-i", str(src), "-c:a", "libvorbis", "-q:a", "5", "-loglevel", "error", str(dst)])


def pitch_shift_ogg(src: Path, dst: Path, semitones: int) -> None:
    """Pitch shift without changing duration: resample by the pitch factor,
    then compensate the tempo. atempo accepts 0.5..2.0 — fine for ±2 st."""
    factor = 2 ** (semitones / 12)
    run([
        "ffmpeg", "-y", "-i", str(src),
        "-af", f"asetrate=44100*{factor:.6f},aresample=44100,atempo={1 / factor:.6f}",
        "-c:a", "libvorbis", "-q:a", "5", "-loglevel", "error",
        str(dst),
    ])
