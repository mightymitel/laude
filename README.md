# Worship Platform — PoC wireframe (YOLO)

Clickable wireframe of the whole platform: **Laudasist** (library, song detail,
karaoke, presenter/stage, live session, companion controls) · **Extractor**
(mock seeder standing in for the offline pipeline) · **LauDJ** (Tauri shell +
web console: mixer, transport, section launcher, pads, session-follow).
Everything runs on the **Firebase Emulator Suite** (`demo-laude`) with mock
data — no real Firebase project, no network dependencies.

## Run it

```bash
npm run poc
```

Then open:

| What | URL |
| --- | --- |
| Laudasist (existing app) | http://localhost:5173 |
| **Platform wireframe hub** | http://localhost:5173/platform |
| LauDJ console | http://localhost:5175 |
| Emulator UI (data browser) | http://localhost:4000 |

Demo sign-in (auth emulator): `demo@laude.local` / `parola-demo` — the platform
views sign in automatically.

## Layout

- `laudasist/` — **its own git repo** (branch `yolo/poc`), hosted app untouched.
  Also hosts the shared packages: `laudasist/packages/{song-model, chords, i18n,
  design-system, auth, session, pad-engine, laudj-control-protocol}` (`@laude/*`)
  so the deployable app owns everything it needs.
- `apps/extractor/` — mock seeder (`npm run seed`). The real Python pipeline
  replaces it behind the same data contract.
- `apps/laudj/` — LauDJ Vite panel + `src-tauri/` shell. Audio engine is a stub
  (`MockEngine` + `PadEngine`); the native Rust engine lands behind the same
  `@laude/laudj-control-protocol` contract. Compiling the Tauri shell needs:
  `sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
  libayatana-appindicator3-dev libssl-dev libxdo-dev`, then
  `npm run tauri -w apps/laudj -- dev`.

Design source of truth: Notion → Worship Platform (Architecture + feature
specs). This wireframe is disposable; refine section by section.
