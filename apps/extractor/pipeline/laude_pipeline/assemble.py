"""Stage 5 — assemble: OCR lyrics + audio analysis -> canonical ChordPro, LRC,
section annotations (with bars), chord events -> manifest.json for the TS
ingest step.

Chord placement: for each lyric line we know its on-screen interval; chords
whose onsets fall inside get inserted at the proportional character position
(snapped to a word start). Everything audio/OCR-derived ships UNVERIFIED.
"""
from __future__ import annotations

import re
from pathlib import Path

from .util import read_json, write_json


def stage_assemble(work: Path) -> dict:
    out_path = work / "manifest.json"
    info = read_json(work / "info.json")
    lyrics = read_json(work / "lyrics.json")
    analysis = read_json(work / "analysis.json")

    key = analysis["key"]
    chords = analysis["chords"]
    beats = analysis["beats"]
    downbeats = [beats[i] for i in analysis["downbeat_indices"] if i < len(beats)]

    title = clean_title(info["title"])
    chordpro_lines: list[str] = [f"{{title: {title}}}", f"{{key: {key}}}", ""]
    lrc: list[dict] = []
    sections_out: list[dict] = []

    last_chord: str | None = None
    for section in lyrics["sections"]:
        is_chorus = section["label"].lower().startswith("chorus")
        chordpro_lines.append(
            "{start_of_chorus}" if is_chorus else f"{{start_of_verse: {section['label']}}}"
        )
        for line in section["lines"]:
            annotated, last_chord = annotate_line(line, chords, last_chord)
            chordpro_lines.append(annotated)
            lrc.append({"time_s": round(line["start_s"], 2), "text": line["text"]})
        chordpro_lines.append("{end_of_chorus}" if is_chorus else "{end_of_verse}")
        chordpro_lines.append("")

        sections_out.append(
            {
                "label": section["label"],
                "start_s": section["start_s"],
                "end_s": section["end_s"],
                "start_bar": bar_at(section["start_s"], downbeats),
                "end_bar": bar_at(section["end_s"], downbeats),
            }
        )

    manifest = {
        "youtube_id": info["youtube_id"],
        "source_url": info["url"],
        "title": title,
        "duration_s": info["duration_s"],
        "language": "ro",
        "key": key,
        "bpm": analysis["bpm"],
        "chordpro": "\n".join(chordpro_lines).strip() + "\n",
        "lrc": lrc,
        "sections": sections_out,
        "chord_events": [{"start_s": c["start_s"], "chord": c["chord"]} for c in chords],
        "beats": beats,
        "downbeat_indices": analysis["downbeat_indices"],
        "files": {
            "stems": {s: f"stems/{s}.ogg" for s in ["vocals", "bass", "drums", "other"]},
            "variants": {
                f"{stem}{st:+d}": f"variants/{stem}{st:+d}.ogg"
                for stem in ["vocals", "bass", "other"]
                for st in [-2, -1, 1, 2]
            },
            "mixdown": "mixdown.ogg",
        },
    }
    write_json(out_path, manifest)
    print(f"assemble: manifest for “{title}” — key {key}, {len(lrc)} LRC lines, "
          f"{len(sections_out)} sections, {len(chords)} chord events")
    return manifest


def clean_title(raw: str) -> str:
    """YouTube titles carry channel/junk: 'BBSO - Isus e Rege Versuri (Lyrics)'."""
    t = raw
    t = re.sub(r"\((official\s+)?(lyric[s]?|versuri)[^)]*\)", "", t, flags=re.I)
    t = re.sub(r"\b(versuri|lyrics|official|video|hd)\b", "", t, flags=re.I)
    if " - " in t:
        t = t.split(" - ", 1)[1]
    t = re.sub(r"\s+", " ", t).strip(" -–|")
    return t or raw


def bar_at(t: float, downbeats: list[float]) -> int:
    bar = 0
    for i, d in enumerate(downbeats):
        if d <= t:
            bar = i
        else:
            break
    return bar


def annotate_line(
    line: dict, chords: list[dict], last_chord: str | None
) -> tuple[str, str | None]:
    text = line["text"]
    t0, t1 = line["start_s"], line["end_s"]
    span = max(0.001, t1 - t0)

    active = active_chord_at(chords, t0)
    inserts: list[tuple[int, str]] = []
    if active is not None and active != last_chord:
        inserts.append((0, active))
        last_chord = active

    for chord in chords:
        if t0 < chord["start_s"] < t1 and chord["chord"] != last_chord:
            pos = int(len(text) * (chord["start_s"] - t0) / span)
            inserts.append((snap_to_word(text, pos), chord["chord"]))
            last_chord = chord["chord"]

    out = []
    consumed = 0
    for pos, chord in sorted(inserts, key=lambda x: x[0]):
        out.append(text[consumed:pos])
        out.append(f"[{chord}]")
        consumed = pos
    out.append(text[consumed:])
    return "".join(out), last_chord


def active_chord_at(chords: list[dict], t: float) -> str | None:
    current = None
    for chord in chords:
        if chord["start_s"] <= t:
            current = chord["chord"]
        else:
            break
    return current


def snap_to_word(text: str, pos: int) -> int:
    """Snap a character position back to the start of the word containing it."""
    pos = max(0, min(len(text), pos))
    while pos > 0 and text[pos - 1] != " ":
        pos -= 1
    return pos
