"""Shared helpers for the extraction pipeline."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from rapidfuzz import fuzz


def run(cmd: list[str], **kwargs) -> None:
    """Run a subprocess, raising with the command line on failure."""
    result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        raise RuntimeError(
            f"command failed ({result.returncode}): {' '.join(cmd)}\n{result.stderr[-2000:]}"
        )


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_line(text: str) -> str:
    """Normalize an OCR'd lyric line for comparison: lowercase, collapse
    whitespace, strip punctuation noise. Diacritics are KEPT (Romanian)."""
    text = text.lower().strip()
    text = re.sub(r"[^0-9a-zăâîșşțţé\s'\-]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def similar(a: str, b: str) -> float:
    """Fuzzy similarity 0..100 between two normalized strings."""
    return fuzz.ratio(normalize_line(a), normalize_line(b))


def video_id_from_url(url: str) -> str:
    m = re.search(r"[?&]v=([\w-]{6,})", url)
    if m:
        return m.group(1)
    m = re.search(r"youtu\.be/([\w-]{6,})", url)
    if m:
        return m.group(1)
    raise ValueError(f"cannot extract a YouTube video id from {url}")


PITCH_CLASS_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
PITCH_CLASS_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]

FLAT_KEYS = {"F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm"}

# Conventional spelling for key NAMES: the black-key majors are flat keys.
FLAT_ROOT_PCS = {1, 3, 6, 8, 10}


def key_name(root_pc: int, minor: bool) -> str:
    names = PITCH_CLASS_NAMES_FLAT if root_pc % 12 in FLAT_ROOT_PCS else PITCH_CLASS_NAMES_SHARP
    return names[root_pc % 12] + ("m" if minor else "")


def chord_name(root_pc: int, minor: bool, key: str) -> str:
    names = PITCH_CLASS_NAMES_FLAT if key in FLAT_KEYS else PITCH_CLASS_NAMES_SHARP
    return names[root_pc % 12] + ("m" if minor else "")
