"""Extractor pipeline CLI.

    uv run python -m laude_pipeline <youtube-url> [--stages download,ocr,stems,analysis,assemble]
                                     [--work DIR] [--force]

Each stage caches its outputs in the work dir; --force re-runs.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from .download import stage_download
from .util import video_id_from_url

ALL_STAGES = ["download", "ocr", "stems", "analysis", "assemble"]


def main() -> None:
    parser = argparse.ArgumentParser(prog="laude_pipeline")
    parser.add_argument("url", help="YouTube URL of a single-song video with on-screen lyrics")
    parser.add_argument("--stages", default=",".join(ALL_STAGES))
    parser.add_argument("--work", default=None, help="work dir (default: ../../../.work/<video-id>)")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    stages = [s.strip() for s in args.stages.split(",") if s.strip()]
    unknown = [s for s in stages if s not in ALL_STAGES]
    if unknown:
        parser.error(f"unknown stages: {unknown}; valid: {ALL_STAGES}")

    video_id = video_id_from_url(args.url)
    repo_root = Path(__file__).resolve().parents[4]
    work = Path(args.work) if args.work else repo_root / ".work" / video_id
    work.mkdir(parents=True, exist_ok=True)
    print(f"work dir: {work}")

    if args.force:
        # Stage entry points check for cached outputs themselves; --force removes them.
        for name in stages:
            for artifact in STAGE_ARTIFACTS.get(name, []):
                target = work / artifact
                if target.exists():
                    if target.is_dir():
                        import shutil

                        shutil.rmtree(target)
                    else:
                        target.unlink()

    if "download" in stages:
        stage_download(args.url, work)
    if "ocr" in stages:
        from .ocr import stage_ocr

        stage_ocr(work)
    if "stems" in stages:
        from .stems import stage_stems

        stage_stems(work)
    if "analysis" in stages:
        from .analysis import stage_analysis

        stage_analysis(work)
    if "assemble" in stages:
        from .assemble import stage_assemble

        stage_assemble(work)


STAGE_ARTIFACTS = {
    "download": ["info.json", "audio.wav", "video.mp4"],
    "ocr": ["lyrics.json", "frames"],
    "stems": ["stems", "variants", "mixdown.ogg"],
    "analysis": ["analysis.json"],
    "assemble": ["manifest.json"],
}


if __name__ == "__main__":
    main()
