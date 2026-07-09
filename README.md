# Worship Platform — `laude`

One monorepo, three products over shared `@laude/*` packages, joined by the
song ID:

- **Laudasist** (`apps/web` + `apps/api`) — bilingual song library, chord
  charts (Nashville degrees + reference key), presenter/viewer sessions.
- **LaudStudio** (`apps/studio`) — offline extraction + interpretation studio;
  local-first SQLite store + audio files served over HTTP (:3002).
- **LauDJ** (`apps/laudj`) — live multi-stem audio console; joins sessions as
  a `dj` presenter. Tauri shell included (`src-tauri/`), engine stubbed.
- **Session relay** (`apps/relay`) — stateful socket.io relay (:3003).

Design source of truth: Notion (Worship Platform). Working contract for
agents: `CLAUDE.md`.

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
