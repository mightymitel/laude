# Worship Platform — `laude`

One monorepo, three products over shared `@laude/*` packages, joined by the
song ID:

- **Laudasist** (`apps/web` + `apps/api`) — bilingual song library, chord
  charts (Nashville degrees + reference key), presenter/viewer sessions.
- **LaudStudio** (`apps/studio`) — offline extraction + interpretation studio;
  local-first SQLite store + audio files served over HTTP (:3002).
- **LauDJ** (`apps/laudj`) — live multi-stem audio console; joins sessions as
  a `dj` presenter. Tauri shell included (`src-tauri/`), engine stubbed.
- **Session relay** (`packages/relay`) — a module mounted inside `apps/api`
  (one backend: REST + socket.io on :3001).

Design source of truth: Notion (Worship Platform). Working contract for
agents: `CLAUDE.md`.

## Deployment

Production is **one App Hosting backend** (web + api + relay, `apphosting.yaml`,
`maxInstances: 1` — session state lives in the relay's RAM) in the
`laudasist-1c1d2` Firebase project, tracking the **`release`** branch: merging
`main → release` is the deploy act; `main` stays free for agent batches.
Firestore rules + indexes deploy ONLY via the release pipeline
(`.github/workflows/release-rules.yml`, gated on `npm run test:rules`) — never
by hand; rules are project-global.

The **old laudasist repo's backend is an archive** (target: `old.laudasist.ro`,
unmaintained, no functional promise — it predates the platform's uid namespace
and WILL break as new rules land). Do not spend effort keeping it alive; the
rollback story is App Hosting rollback + relay LAN mode (DEC-101), never the
frozen app.

## Run it

```bash
npm i
npm run poc     # emulators + seeders + api + relay + web + laudj + studio
```

| What | URL |
| --- | --- |
| Laudasist | http://localhost:5173 |
| LauDJ console | http://localhost:5175 |
| LaudStudio service | http://localhost:3002/health |
| Emulator UI | http://localhost:4000 |

Firebase = **emulator only** (`demo-laude`). Demo sign-in:
`demo@laude.local` / `parola-demo`.

## Tests

```bash
npm run test        # all workspace unit tests + boundary check
npm run test:e2e    # hermetic Playwright run (boots emulators, seeds)
```

## History

This repo merged two histories on 2026-07-09 (tag `pre-degrees-migration`):
the original outer `laude` workspace (LaudStudio + LauDJ) and the `laudasist`
repo (web, api, relay, packages). The old `laudasist` GitHub repo is frozen as
the laudasist.ro deploy source / rollback.

Compiling the Tauri shell needs:
`sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
libayatana-appindicator3-dev libssl-dev libxdo-dev`, then
`npm run tauri -w apps/laudj -- dev`.
