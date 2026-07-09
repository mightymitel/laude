# Viewport Rendering Contract — v2

**Version:** 2 (`VIEWPORT_CONTRACT_VERSION` in `apps/web/src/viewports/contract.ts`)

**v2 (2026-07-09):** `current.section_index` may now be the explicit value
`'instrumental'` (DEC-62) — a first-class state for stretches of a recording
with no work part. It is session STATE (late joiners inherit it), not a blank
directive and not a held previous part. Per-class rendering rules:

| Class | Renders instrumental as |
| --- | --- |
| `main` | dark (same visual as blank; other classes stay live) |
| `stage` | "instrumental" + *Next*: the driving DJ's announced `current.next_part` when present (truth), else the part after the last announced one (heuristic) |
| `instrument` | holds the last announced part's chords, labeled `· instrumental` |
| `subtitles` | empty line |


A viewport is an **ordinary viewer of the session**: someone opens the viewer
link in a browser, picks a viewport, fullscreens it. No special client, no
session identity, no connection bookkeeping. This document versions the two
halves every viewport (preset today, authored template later) is built on.
Templates written against v1 must keep rendering as the session model grows —
additions are allowed, renames/removals require a version bump.

## 1. Placeholders — what a viewport *reads*

Resolved from the **by-value session state** (`@laude/session` `SessionState`).
All placeholders have **omit-if-empty semantics**: a lyrics-only song renders
without a chord row, the last section renders without a next-part block — no
holes.

| Placeholder | Source | Empty when |
| --- | --- | --- |
| `{{song_title}}` | `currentSong.title` | no current song |
| `{{song_author}}` | `currentSong.author` | author unset |
| `{{key}}` | `current.key ?? currentSong.originalKey` | no current song |
| `{{section_name}}` | `currentSong.parts[current.section_index].type` | out of range or `'instrumental'` |
| `{{lyrics}}` | current part lines, chord tokens stripped | no current song |
| `{{chords}}` | current part chord row | song has no chords / chords hidden |
| `{{next_part}}` | the part after the current one | last part |
| `{{message}}` | the directive `message` for the viewport's class | no message |

Chords are **stored as Nashville degrees + a reference key** (DEC-45) and are
rendered through `@laude/chords` in the **device's notation** — notation is a
per-device preference, never session state (DEC-42).

## 2. Declared class — what a viewport *obeys*

Every viewport declares exactly one class. The session broadcasts a
**directive map keyed by target class**; every viewport receives the whole map
and **self-selects** its own class's entry. No routing, no viewport
identities in session state. Directives are **state, not events** — late
joiners inherit the current values from the join snapshot.

Preset classes (v1): `main` · `stage` · `instrument` · `subtitles`.
The directive map is open-keyed: authored templates may declare new classes
without a contract bump.

| Directive | Type | Meaning |
| --- | --- | --- |
| `blank` | boolean | Render nothing (black). Other classes stay live. |
| `freeze` | boolean | Hold the currently rendered song/part; live updates continue underneath and apply on unfreeze. |
| `message` | string \| null | Show this text instead of content while non-null. |

## 3. Presets (code, not data)

| Preset | Class | Shows |
| --- | --- | --- |
| Main / Lyrics | `main` | lyrics only |
| Stage | `stage` | lyrics + chords + next part |
| Instrument | `instrument` | chords (device notation) + lyrics + next part |
| Subtitles | `subtitles` | one line, transparent background *(dedicated authored renderer deferred — the class is registered and obeys directives)* |

Each preset exposes **style options** (notation, chords on/off, font scale,
background) persisted **per device** in `localStorage`
(`laudasist.viewport.<class>`).

## 4. Out of scope in v1 (kept open, not designed out)

Custom authored templates (restricted validated template language: tag +
attribute allowlist, no scripts; validated on import AND save), the viewport
builder, church-scoped saved viewports, presenter-driven secondary-window
control. The placeholder vocabulary and class semantics above are the stable
surface those features build on.
