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
- `apps/api` — Laudasist backend (Express + Firebase Admin). Mounts the
  session relay (`@laude/relay`, DEC-52): one process, REST + socket.io on
  :3001; in production it also serves the built web bundle (DEC-103).
- `apps/laudj` — LauDJ engine + control panel (web now, Tauri shell later).
- `apps/studio` — LaudStudio: local SQLite store + HTTP service (:3002),
  seeders, ingest, editor. (Folder renamed from `laudstudio`; product name is
  still LaudStudio and `LAUDSTUDIO_*` env vars keep their names.)
- `packages/*` — shared `@laude/*`: song-model, chords, session, design-system,
  i18n, auth, pad-engine, tuner, laudj-control-protocol, shared.

**Boundary rule (enforced by `npm run check:boundaries`):** `packages/*`,
`apps/web` and `apps/api` may never import from `apps/laudj` or `apps/studio`.
Laudasist is complete alone; Studio and LauDJ are power-ups (DEC-64).

## The frozen laudasist repo & deployment
The old `laudasist` repo (github.com/mightymitel/laudasist) is **FROZEN**: its
backend is an **archive** (target: old.laudasist.ro, unmaintained, no
functional promise — it WILL break as new rules land, DEC-100). Never commit
or push to it. The rollback story is App Hosting rollback + relay LAN mode
(DEC-101), never the frozen app.

THIS repo deploys (DEC-100/102/103): one App Hosting backend `laudasist`
(project `laudasist-1c1d2`, europe-west4) tracking the **`release`** branch —
merging `main → release` IS the deploy act; `main` stays free for agents.
Firestore rules/indexes deploy ONLY via `.github/workflows/release-rules.yml`
(gated on `npm run test:rules`) — never `firebase deploy --only
firestore:rules` by hand. Dev remains **emulator only** (`demo-laude`).

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

## Starting a build session (/next — zero-paste handoff, DEC-139)
When Mitel says `/next` or "pull the next brief":
1. Query the Notion **Build Queue** (`collection://6bf7eb75-e777-4cc8-8547-30ce41afed82`)
   for the top Status=**Ready** row by Priority.
2. Read its body (the kickoff brief) + the linked Spec + its tickets.
3. Set that row Status=**Running**.
4. Run the pre-flight audit gate (delegate to the `preflight-auditor` agent),
   then execute the brief autonomously.
5. On finish: write the session report under **Code Sessions**
   (page `3986a3293ac3819ea2adfd8f0b79d5af` — this project's "Build Session
   Outputs"), link it on the row's `Session report` property, flip the row +
   its tickets to Done, and leave any deviations stamped ⚠️ UNRECONCILED in
   the spec.

**NEVER start a build session without a Ready brief in the queue.**

Model routing (committed in `.claude/agents/`): presence sweeps / searches /
i18n extraction run on Haiku agents, post-change review on Sonnet — the main
session spends its budget on judgement and the build itself.
