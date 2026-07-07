"""Stage 2 — ocr: video frames -> timed, structured lyrics.

Approach: sample frames at 1 fps, OCR each with Tesseract (Romanian), collapse
consecutive frames showing the same text into timed *blocks* (a block ≈ one
projected lyric screen), then detect structure: blocks whose text repeats
across the song are chorus screens; everything else groups into verses.
The on-screen display times double as karaoke (LRC) line timings.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import pytesseract
from PIL import Image, ImageOps

from .util import normalize_line, read_json, run, similar, write_json

FPS = 1.0
MATCH_THRESHOLD = 80  # fuzzy % for "same text as previous frame"
CHORUS_THRESHOLD = 82  # fuzzy % for "this block is a repeat of that one"
MIN_BLOCK_SECONDS = 2.0
MIN_LINE_CHARS = 3


@dataclass
class Block:
    lines: list[str]
    start_s: float
    end_s: float

    @property
    def text(self) -> str:
        return " / ".join(self.lines)


def stage_ocr(work: Path) -> dict:
    out_path = work / "lyrics.json"
    if out_path.exists():
        print("ocr: cached")
        return read_json(out_path)

    frames_dir = work / "frames"
    if not frames_dir.exists() or not any(frames_dir.iterdir()):
        frames_dir.mkdir(exist_ok=True)
        run([
            "ffmpeg", "-y", "-i", str(work / "video.mp4"),
            "-vf", f"fps={FPS}", "-loglevel", "error",
            str(frames_dir / "%05d.png"),
        ])

    frames = sorted(frames_dir.glob("*.png"))
    print(f"ocr: {len(frames)} frames")

    per_frame: list[tuple[float, list[str]]] = []
    for i, frame in enumerate(frames):
        t = i / FPS
        lines = ocr_frame(frame)
        per_frame.append((t, lines))

    video_title = read_json(work / "info.json").get("title", "")
    blocks = collapse_frames(per_frame)
    blocks = drop_non_lyric_blocks(blocks, video_title)
    sections = merge_consecutive(detect_structure(blocks))

    result = {
        "sections": [
            {
                "label": label,
                "start_s": round(block.start_s, 2),
                "end_s": round(block.end_s, 2),
                "lines": [
                    {"text": line, "start_s": round(ls, 2), "end_s": round(le, 2)}
                    for line, ls, le in split_line_times(block)
                ],
            }
            for label, block in sections
        ]
    }
    write_json(out_path, result)
    n_lines = sum(len(s["lines"]) for s in result["sections"])
    print(f"ocr: {len(result['sections'])} screens/sections, {n_lines} lyric lines")
    return result


def ocr_frame(path: Path) -> list[str]:
    """OCR one frame. Lyrics are typically light text on a darker scene:
    grayscale -> upscale -> binarize (keep bright pixels) -> invert for
    Tesseract (dark text on white)."""
    img = Image.open(path).convert("L")
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    img = img.point(lambda p: 255 if p > 175 else 0)
    img = ImageOps.invert(img)
    text = pytesseract.image_to_string(img, lang="ron", config="--psm 6")
    lines: list[str] = []
    for raw in text.splitlines():
        line = clean_ocr_line(raw)
        if line:
            lines.append(line)
    return lines


def clean_ocr_line(raw: str) -> str | None:
    line = re.sub(r"\s+", " ", raw).strip()
    # Projected chorus screens often carry an "R." (refren) marker.
    line = re.sub(r"^R[.:]?\s+", "", line)
    if len(line) < MIN_LINE_CHARS:
        return None
    letters = sum(1 for c in line if c.isalpha())
    if letters < max(3, len(line) * 0.6):
        return None  # symbol soup / watermark fragments
    if len(line.split()) < 2:
        return None  # single tokens are usually logos or noise
    if line.isupper():
        # On-screen lyrics are usually ALL CAPS; sentence-case for storage.
        line = line[0] + line[1:].lower()
    return line


def collapse_frames(per_frame: list[tuple[float, list[str]]]) -> list[Block]:
    blocks: list[Block] = []
    current: Block | None = None
    for t, lines in per_frame:
        text = " / ".join(lines)
        if not lines:
            if current is not None:
                current.end_s = t
                blocks.append(current)
                current = None
            continue
        if current is not None and similar(text, current.text) >= MATCH_THRESHOLD:
            current.end_s = t + 1 / FPS
            # Prefer the longest reading of the same screen (OCR flickers).
            if len(text) > len(current.text):
                current.lines = lines
            continue
        if current is not None:
            current.end_s = t
            blocks.append(current)
        current = Block(lines=lines, start_s=t, end_s=t + 1 / FPS)
    if current is not None:
        blocks.append(current)

    merged = [b for b in blocks if b.end_s - b.start_s >= MIN_BLOCK_SECONDS]
    print(f"ocr: {len(blocks)} raw blocks -> {len(merged)} kept")
    return merged


def drop_non_lyric_blocks(blocks: list[Block], video_title: str) -> list[Block]:
    """Drop title cards (text ≈ the video title, or a lone early line) and
    fade/outro fragments with almost no letters."""
    kept: list[Block] = []
    for i, block in enumerate(blocks):
        letters = sum(1 for c in block.text if c.isalpha())
        if letters < 12:
            continue
        if similar(block.text, video_title) >= 55:
            continue
        if i == 0 and len(block.lines) == 1 and block.start_s < 15:
            continue  # early single-line screen = title/credit card
        kept.append(block)
    if len(kept) != len(blocks):
        print(f"ocr: dropped {len(blocks) - len(kept)} non-lyric blocks (title/fade cards)")
    return kept


def merge_consecutive(labeled: list[tuple[str, Block]]) -> list[tuple[str, Block]]:
    """Consecutive screens with the same label form one section."""
    merged: list[tuple[str, Block]] = []
    for label, block in labeled:
        if merged and merged[-1][0] == label:
            prev = merged[-1][1]
            if similar(block.text, prev.text) < CHORUS_THRESHOLD:
                prev.lines = prev.lines + block.lines  # continuation screen
            prev.end_s = block.end_s  # identical repeat: extend, don't duplicate
        else:
            merged.append((label, Block(lines=list(block.lines), start_s=block.start_s, end_s=block.end_s)))
    return merged


def detect_structure(blocks: list[Block]) -> list[tuple[str, Block]]:
    """Cluster repeated screens: any block whose text recurs later is a chorus
    screen; consecutive non-repeating blocks become numbered verses."""
    clusters: list[list[int]] = []
    for i, block in enumerate(blocks):
        placed = False
        for cluster in clusters:
            if similar(block.text, blocks[cluster[0]].text) >= CHORUS_THRESHOLD:
                cluster.append(i)
                placed = True
                break
        if not placed:
            clusters.append([i])

    chorus_indices = {i for c in clusters if len(c) >= 2 for i in c}

    labeled: list[tuple[str, Block]] = []
    verse_no = 0
    prev_was_verse_group = False
    for i, block in enumerate(blocks):
        if i in chorus_indices:
            labeled.append(("Chorus", block))
            prev_was_verse_group = False
        else:
            if not prev_was_verse_group:
                verse_no += 1
            labeled.append((f"Verse {verse_no}", block))
            prev_was_verse_group = True
    return labeled


def split_line_times(block: Block) -> list[tuple[str, float, float]]:
    """A screen shows N lines for its whole duration; split the interval
    evenly so karaoke advances line by line."""
    n = len(block.lines)
    span = (block.end_s - block.start_s) / max(1, n)
    return [
        (line, block.start_s + i * span, block.start_s + (i + 1) * span)
        for i, line in enumerate(block.lines)
    ]
