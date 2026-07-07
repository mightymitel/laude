# LauDJ — live audio console (PoC wireframe)

The LauDJ control panel: stem mixer, transport with key-variant/tempo controls,
section launcher, pads, and a session-follow strip that joins `sessions/main`
as the `laudj` peer presenter (with the yield-to-humans rule).

## Run the panel (web)

Prerequisite: the Firebase emulators are running (`firebase emulators:start`
via the repo root / `laudasist`). From the repo root:

```bash
npm run dev -w apps/laudj
```

Panel: http://localhost:5175. Songs are read from the Firestore **emulator**
(`songs` → preferred/first `performances` → `sections`); if the emulator is
empty or unreachable for 3s, two hardcoded mock songs are registered instead.

## Audio is STUBBED

There is no audio in the PoC:

- `MockEngine` (from `@laude/laudj-control-protocol/mock`) fakes the whole
  engine — ticking transport, animated meters, quantized section launches.
- `@laude/pad-engine` is a state machine (drone/interlude chord stream), no
  Web Audio.

The real native engine will live in `src-tauri/` behind the same
`EngineCommand`/`EngineState` contract; the panel does not change.

## Tauri shell (scaffold only — do not build yet)

`src-tauri/` is a Tauri v2 scaffold (window 1280x800, devUrl → :5175, one stub
`engine_status` command marking the future engine RPC). Compiling it needs the
system WebKit/GTK libraries, which are not installed on this box yet:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Once installed (plus a Rust toolchain via rustup):

```bash
cd apps/laudj
npx tauri dev
```

`bundle.active` is `false`, so no app icons are required for the PoC.
