"""Stage 4 — analysis: BPM, beat grid, downbeats, key, and chord recognition.

Chord recognition (MVP): beat-synchronous chroma from the harmonic stems
(bass + other), correlated against 24 major/minor triad templates, smoothed
with Viterbi (sticky self-transitions). Worship harmony is mostly diatonic
triads, so template matching lands "approximately right" — which is the
acceptance bar for this run. The real pipeline can swap in a learned model
behind the same output shape.
"""
from __future__ import annotations

from pathlib import Path

import librosa
import numpy as np

from .util import chord_name, key_name, read_json, write_json

SR = 22050
SELF_TRANSITION = 0.85
# Cosine scores between chroma and triad templates live in a narrow band;
# without sharpening the sticky prior wins forever and the decoder never
# changes chords. exp(BETA * cos) spreads them out.
EMISSION_BETA = 15.0
KRUMHANSL_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KRUMHANSL_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def stage_analysis(work: Path) -> dict:
    out_path = work / "analysis.json"
    if out_path.exists():
        print("analysis: cached")
        return read_json(out_path)

    y, _ = librosa.load(str(work / "audio.wav"), sr=SR, mono=True)
    tempo, beat_times = librosa.beat.beat_track(y=y, sr=SR, units="time")
    bpm = float(np.atleast_1d(tempo)[0])
    beat_times = np.asarray(beat_times)
    if bpm > 120:
        # Worship songs live around 60–100 BPM; the tracker often locks onto
        # double-time. Halve: keep every other beat.
        bpm /= 2
        beat_times = beat_times[::2]
    print(f"analysis: bpm ~{bpm:.1f}, {len(beat_times)} beats")

    downbeat_offset = estimate_downbeat_offset(y, beat_times)
    downbeat_indices = list(range(downbeat_offset, len(beat_times), 4))

    # Harmony chroma from the pitched accompaniment (skip drums+vocals bleed).
    bass, _ = librosa.load(str(work / "stems" / "bass.ogg"), sr=SR, mono=True)
    other, _ = librosa.load(str(work / "stems" / "other.ogg"), sr=SR, mono=True)
    n = min(len(bass), len(other))
    harmony = bass[:n] * 0.8 + other[:n]

    chroma = librosa.feature.chroma_cqt(y=harmony, sr=SR)
    beat_frames = librosa.time_to_frames(beat_times, sr=SR)
    beat_chroma = sync_median(chroma, beat_frames)

    key = detect_key(chroma)
    chords = decode_chords(beat_chroma, beat_times, key, float(len(y)) / SR)

    result = {
        "bpm": round(bpm, 1),
        "beats": [round(float(t), 3) for t in beat_times],
        "downbeat_indices": downbeat_indices,
        "key": key,
        "chords": chords,
    }
    write_json(out_path, result)
    print(f"analysis: key {key}, {len(chords)} chord segments")
    return result


def sync_median(chroma: np.ndarray, beat_frames: np.ndarray) -> np.ndarray:
    """Median chroma per beat interval -> (12, n_beats)."""
    bounds = np.concatenate([[0], beat_frames, [chroma.shape[1]]])
    cols = []
    for i in range(1, len(bounds) - 1):
        lo, hi = int(bounds[i]), int(max(bounds[i] + 1, bounds[i + 1]))
        cols.append(np.median(chroma[:, lo:hi], axis=1))
    return np.array(cols).T


def estimate_downbeat_offset(y: np.ndarray, beat_times: np.ndarray) -> int:
    """Pick the beat phase (0..3) whose beats carry the most onset energy —
    a crude but serviceable downbeat estimate for 4/4 worship songs."""
    onset = librosa.onset.onset_strength(y=y, sr=SR)
    frames = librosa.time_to_frames(beat_times, sr=SR)
    frames = np.clip(frames, 0, len(onset) - 1)
    strengths = onset[frames]
    scores = [float(strengths[offset::4].sum()) for offset in range(4)]
    return int(np.argmax(scores))


def detect_key(chroma: np.ndarray) -> str:
    profile = chroma.mean(axis=1)
    best_score, best_key = -np.inf, "C"
    for root in range(12):
        for minor, template in ((False, KRUMHANSL_MAJOR), (True, KRUMHANSL_MINOR)):
            score = float(np.corrcoef(profile, np.roll(template, root))[0, 1])
            if score > best_score:
                best_score, best_key = score, key_name(root, minor)
    return best_key


def chord_templates() -> tuple[np.ndarray, list[tuple[int, bool]]]:
    templates, labels = [], []
    for root in range(12):
        for minor in (False, True):
            t = np.zeros(12)
            t[root] = 1.0
            t[(root + (3 if minor else 4)) % 12] = 0.85
            t[(root + 7) % 12] = 0.9
            templates.append(t / np.linalg.norm(t))
            labels.append((root, minor))
    return np.array(templates), labels


def decode_chords(
    beat_chroma: np.ndarray, beat_times: np.ndarray, key: str, duration_s: float
) -> list[dict]:
    templates, labels = chord_templates()
    obs = beat_chroma / (np.linalg.norm(beat_chroma, axis=0, keepdims=True) + 1e-9)
    scores = templates @ obs  # (24, n_beats) cosine similarity
    emissions = np.exp(EMISSION_BETA * scores)
    emissions = emissions / emissions.sum(axis=0, keepdims=True)

    n_states, n_steps = emissions.shape
    switch = (1 - SELF_TRANSITION) / (n_states - 1)
    log_self, log_switch = np.log(SELF_TRANSITION), np.log(switch)
    log_emit = np.log(emissions)

    dp = log_emit[:, 0].copy()
    back = np.zeros((n_states, n_steps), dtype=np.int32)
    for t in range(1, n_steps):
        stay = dp + log_self
        best_prev = int(np.argmax(dp))
        jump = dp[best_prev] + log_switch
        take_stay = stay >= jump
        back[:, t] = np.where(take_stay, np.arange(n_states), best_prev)
        dp = np.where(take_stay, stay, jump) + log_emit[:, t]

    path = np.zeros(n_steps, dtype=np.int32)
    path[-1] = int(np.argmax(dp))
    for t in range(n_steps - 1, 0, -1):
        path[t - 1] = back[path[t], t]

    segments: list[dict] = []
    for i, state in enumerate(path):
        start = float(beat_times[i - 1]) if i > 0 else 0.0
        root, minor = labels[int(state)]
        name = chord_name(root, minor, key)
        if segments and segments[-1]["chord"] == name:
            continue
        segments.append({"start_s": round(start, 3), "chord": name})
    for i, seg in enumerate(segments):
        seg_end = segments[i + 1]["start_s"] if i + 1 < len(segments) else duration_s
        seg["end_s"] = round(float(seg_end), 3)
    return segments
