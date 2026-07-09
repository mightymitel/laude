#!/usr/bin/env bash
# Worship Platform PoC — one command to run everything against the Firebase emulator.
#   npm run poc
# Starts: emulator suite (demo-laude) · seeders (global Firestore + local
# SQLite) · Laudasist API (3001) · session relay (3003) · Laudasist web (5173)
# · LauDJ panel (5175) · LaudStudio service (3002).
set -euo pipefail
cd "$(dirname "$0")/.."

IMPORT_ARGS=""
if [ -d .emulator-data ]; then
  IMPORT_ARGS="--import .emulator-data"
fi

# No --kill-others: the seeder is a one-shot that exits when done; the rest
# keep running. Ctrl+C stops the whole stack.
exec npx concurrently \
  -n emu,seed,api,relay,web,laudj,studio \
  -c gray,cyan,green,red,blue,magenta,yellow \
  "firebase emulators:start --project demo-laude ${IMPORT_ARGS} --export-on-exit .emulator-data" \
  "npm run seed -w apps/studio" \
  "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-laude npm run dev -w apps/api" \
  "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-laude npm run dev -w apps/relay" \
  "npm run dev -w apps/web" \
  "npm run dev -w apps/laudj" \
  "npm run serve -w apps/studio"
