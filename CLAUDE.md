# Worship Platform — `laude` monorepo (CLAUDE.md)

## What this is
A bilingual worship platform built from our church's service recordings: a song
library with karaoke lyrics + transposable chord charts (**Laudasist**), an
offline extraction/interpretation studio (**LaudStudio**), and live multi-stem
audio (**LauDJ**). One repo, three deploy targets. NOTION is the source of
truth for design — read it via the Notion MCP (Worship Platform → Architecture,
Firebase Data Model & Contract, Session & Realtime Sync, the LaudStudio specs,
and the Decision Log).

## Two domains, joined only by the song ID
- **Global (Firebase):** the song as a *work* — `songs`, `song_lyrics`,
  `song_links`, `setlists`, `setlist_items`, users. Chords are stored as
  **Nashville degrees** inside ChordPro with a `{key:}` reference (DEC-45/46).
  Cloud Storage holds pads only. Firebase = **emulator only** in dev
  (`demo-laude`); never the real project or real data.
- **Personal (local-first):** LaudStudio + LauDJ share one SQLite store +
  local audio files (`apps/studio/data/`, never committed). Performances,
  sections, beat grid, chord events, LRC, stems stay local — **LRC never
  crosses to global** (DEC-44).

## Repo layout
- `apps/web` — Laudasist frontend (React 19 + Vite + TanStack Router/Query).
- `apps/api` — Laudasist backend (Express, Firebase Admin, REST only).
- `apps/relay` — stateful session relay (Express + socket.io, :3003).
  DEC-52 wants it re-fused as `packages/relay`; until that ticket lands it
  stays a workspace app.
- `apps/laudj` — LauDJ engine + control panel (web now, Tauri shell later).
- `apps/studio` — LaudStudio: local SQLite store + HTTP service (:3002),
  seeders, ingest, editor. (Folder renamed from `laudstudio`; product name is
  still LaudStudio and `LAUDSTUDIO_*` env vars keep their names.)
- `packages/*` — shared `@laude/*`: song-model, chords, session, design-system,
  i18n, auth, pad-engine, tuner, laudj-control-protocol, shared.

**Boundary rule (enforced by `npm run check:boundaries`):** `packages/*`,
`apps/web` and `apps/api` may never import from `apps/laudj` or `apps/studio`.
Laudasist is complete alone; Studio and LauDJ are power-ups (DEC-64).

## The frozen laudasist repo
The old `laudasist` repo (github.com/mightymitel/laudasist) is **FROZEN**: its
main branch auto-deploys laudasist.ro against the old Firebase project and is
the rollback. Never commit to it, never push to it, never wire
`apphosting.yaml` from here without an explicit ticket.

## Commands (npm everywhere; Node via nvm)
- Install: `npm i` · One-command dev stack: `npm run poc`
- Emulators only: `npm run emulators`
- Tests: `npm run test` (all workspaces + boundary check) ·
  `npm run test:e2e` (hermetic: boots emulators, seeds, runs Playwright)
- `npm run lint` is currently broken by a pre-existing dep issue (ticketed).

## Conventions
- Bilingual RO (default) + EN via `@laude/i18n` for existing surfaces; per
  DEC-18 new features may hardcode English, a translation pass comes later.
- Change a shared shape → update every consumer in the same change; the
  `@laude/song-model` types + Firestore rules are the data contract.
- Auto/mock-extracted content ships `verified=false` (UNVERIFIED).
- Keep domain logic in plain framework-agnostic TS modules; React renders.

## Code quality
- Correctness and clarity over cleverness; follow existing patterns.
- Minimal targeted diffs; no reformatting unrelated code; no dead code.
- Handle errors explicitly; never swallow them.
- Don't invent APIs; verify deps exist. Ask before adding a dependency.
- No hacks by default — if truly needed, smallest possible, labeled `// HACK:`.
- Never hardcode secrets.

## TypeScript
- **No `any`**; prefer `unknown` + narrowing. **No casts (`as`)** except
  genuinely exceptional cases, isolated and justified in a comment.
- `strict` tsconfig; fix type errors properly.

## Testing
- Unit: node:test/tsx in packages + studio; Vitest where already present.
- E2E: Playwright against the **emulator** with seeded data — never real
  Firebase. Never weaken, skip, or delete a test to go green.
