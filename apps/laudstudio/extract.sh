#!/usr/bin/env bash
# End-to-end extraction: YouTube URL -> pipeline -> emulator ingest -> validation.
#   npm run extract -w apps/laudstudio -- <youtube-url> [reference-chart-url]
# Requires the PoC stack running (npm run poc).
set -euo pipefail
cd "$(dirname "$0")"

URL="${1:?usage: extract.sh <youtube-url> [reference-url]}"
REFERENCE="${2:-}"

VIDEO_ID=$(echo "$URL" | grep -oP '(?<=[?&]v=)[\w-]{6,}' || echo "$URL" | grep -oP '(?<=youtu\.be/)[\w-]{6,}')
WORK="$(cd ../.. && pwd)/.work/${VIDEO_ID}"

(cd pipeline && uv run python -m laude_pipeline "$URL")

if [ -n "$REFERENCE" ]; then
  npx tsx src/ingest.ts --work "$WORK" --reference "$REFERENCE"
else
  npx tsx src/ingest.ts --work "$WORK"
fi
