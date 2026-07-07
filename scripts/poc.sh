#!/usr/bin/env bash
# Worship Platform PoC — one command to run everything against the Firebase emulator.
#   npm run poc
# Starts: emulator suite (demo-laude) · mock seeder (idempotent, waits for the
# emulator) · Laudasist API (3001) · Laudasist web (5173) · LauDJ panel (5175).
set -euo pipefail
cd "$(dirname "$0")/.."

IMPORT_ARGS=""
if [ -d .emulator-data ]; then
  IMPORT_ARGS="--import ../.emulator-data"
fi

exec npx concurrently -k \
  -n emu,seed,api,web,laudj \
  -c gray,cyan,green,blue,magenta \
  "cd laudasist && firebase emulators:start --project demo-laude ${IMPORT_ARGS} --export-on-exit ../.emulator-data" \
  "npm run seed -w apps/extractor" \
  "cd laudasist && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-laude npm run dev:api" \
  "cd laudasist && npm run dev:web" \
  "npm run dev -w apps/laudj"
