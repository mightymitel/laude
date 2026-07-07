# Worship Platform — project rules (CLAUDE.md)

## What this is
Turn our church's YouTube service recordings into a bilingual worship platform
for small house-groups: a song library with karaoke lyrics + transposable chord
charts (**Laudasist**), an offline extraction pipeline (**Extractor**), and live
multi-stem audio (**LauDJ**). Three apps over shared `@laude/*` packages, joined
by the **song ID**. NOTION is the source of truth — read it via the Notion MCP
(Worship Platform → Architecture + the per-app feature specs + Next Up).

## Right now: this is a WIREFRAME PoC (YOLO)
Build a clickable, functional wireframe of the WHOLE platform — every app + main
feature — with **mock data on the Firebase emulator**. Prototype quality: stub
anything heavy (ML pipeline, native audio DSP, real integrations). Breadth over
depth. It's disposable; we refine section by section later.

## Architecture
- **Extractor** (Python, offline batch) — real pipeline later; **for the PoC, a
  MOCK seeder** that writes realistic fake songs/lyrics/chords/time-annotations
  into the emulator. No yt-dlp/Demucs/ML yet.
- **packages/** (TypeScript, shared): `@laude/chords` (real — ChordSheetJS +
  notation), `song-model`, `design-system` (tokens + primitives + 3 hero views),
  `i18n` (ro/en), `auth`, `session`, `pad-engine` (stub), `laudj-control-protocol`.
- **Laudasist** (existing TS + Firebase app) — cloned into the monorepo, run
  against the emulator, restyled with the design tokens.
- **LauDJ** — **Tauri + native Rust** (DECIDED; spikes skipped). Scaffold the
  Tauri shell + web control panel wireframe; **stub the audio engine** (pads,
  stems, transport, session-follow) with mocks.

## Backend = Firebase (EMULATOR ONLY for the PoC)
Firestore + Cloud Storage + Auth via the Emulator Suite. Never a real project or
real data. The Firestore schema + storage layout is the data contract; the **song
ID is the join key**. No Postgres/SQLite.

## Bilingual rules
1. App UI fully bilingual via `@laude/i18n` — NEVER hardcode a user-facing string;
   every key in `ro.json` AND `en.json`. Default locale: RO.
2. Content is language-separated; the only cross-link is a `song_links`
   translation relation.

## Conventions
- Auto/mock-extracted content is written `verified=false` (UNVERIFIED).
- Chords: canonical ChordPro; display in any notation (incl. user-defined);
  transpose client-side.
- Keys pre-rendered, tempo live (drums excluded) — stubbed in the wireframe.
- LauDJ joins the session as a peer presenter; yields to humans on external change.

## Commands
- Install deps: `pnpm i` · Dev: `pnpm --filter <app> dev`
- Typecheck: `pnpm turbo typecheck` · Test: `pnpm turbo test`
- Firebase emulators: `firebase emulators:start`
- LauDJ (Tauri): `pnpm --filter @wp/laudj tauri dev`

## YOLO session rules
Work on a `yolo/poc` branch (git = rollback). Commit often. Make reasonable
assumptions for anything minor and LOG them. At the end, give a section-by-section
summary + assumption log + open questions to fold back into the Notion specs.
