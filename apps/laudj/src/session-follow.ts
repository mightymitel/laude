/**
 * LauDJ ↔ session glue (the "dj" presenter):
 *  - FOLLOW unconditionally: mirror the session's song + key into the engine/pads.
 *  - YIELD only when a HUMAN presenter changes musical intent (tier 1) — pauses
 *    LauDJ's own auto-advance, never its obedience.
 *  - OBEY companion directives (tier 2) as deltas, so local operator tweaks
 *    survive until the leader changes something.
 *  - WRITE BACK: when LauDJ's auto-advance crosses a section boundary, it
 *    writes section_index back to the session like any other presenter.
 *  - ADVERTISE the local catalog as the DJ capability manifest on join.
 */
import type { EngineState } from '@laude/laudj-control-protocol';
import type { DjManifestEntry, SessionChange, SessionClient, SessionState } from '@laude/session';
import type { CompanionDirectives, Presenter } from '@laude/song-model';
import { engine, padEngine } from './engine';
import { padsController, padStyleOf } from './pads-controller';
import { fetchCatalog } from './studio';

export const RELAY_URL: string =
  typeof import.meta.env?.VITE_RELAY_URL === 'string'
    ? import.meta.env.VITE_RELAY_URL
    : 'http://localhost:3003';

const CODE_STORAGE_KEY = 'laudj.presenterCode';

export function loadSavedCode(): string {
  return localStorage.getItem(CODE_STORAGE_KEY) ?? '';
}

export function saveCode(code: string): void {
  localStorage.setItem(CODE_STORAGE_KEY, code);
}

export const LAUDJ_PRESENTER: Presenter = {
  id: 'laudj-engine',
  name: 'LauDJ',
  kind: 'dj',
  joined_at: new Date().toISOString(),
};

/** The DJ capability manifest: what this DJ can play, linked or local-only. */
export async function buildManifest(): Promise<DjManifestEntry[]> {
  const catalog = await fetchCatalog();
  return catalog.map((song) => ({
    song_id: song.linked ? song.song_id : null,
    local_song_id: song.local_song_id,
    title: song.title,
    key: song.key,
    bpm: song.bpm,
    has_stems: song.stems.length > 0,
  }));
}

export function handleSessionChange(
  change: SessionChange,
  getEngineState: () => EngineState | null,
  prev: SessionState | null,
): void {
  const { state: session, external, writerKind } = change;
  // Yield only on external changes to MUSICAL INTENT (tier 1, `current.*`).
  // Companion directives (tier 2) are meant to be obeyed, not yielded to, and
  // the first snapshot after joining is existing state, not a change.
  const currentChanged =
    prev !== null && JSON.stringify(prev.current) !== JSON.stringify(session.current);
  if (external && currentChanged) {
    // Unknown writers are treated as human — safer to yield than to fight.
    const humanWriter = writerKind === null || writerKind === 'human' || writerKind === 'mic';
    if (humanWriter) engine.externalPresenterActed();
  }
  // FOLLOW is unconditional ("react" behaviour): the engine always mirrors
  // the session's song/key. Yield only pauses LauDJ's own auto-advance —
  // it never stops LauDJ from obeying the human presenter.
  const now = getEngineState();
  if (now) {
    if (session.current.song_id && session.current.song_id !== now.transport.song_id) {
      engine.send({ type: 'load_song', song_id: session.current.song_id });
    }
    padEngine.setKey(session.current.key);
  }
  applyCompanion(prev?.companion ?? null, session);
}

function applyCompanion(prev: CompanionDirectives | null, session: SessionState): void {
  const next = session.companion;
  const key = session.current.key;
  if (next.pad_style !== prev?.pad_style) padsController.setStyle(padStyleOf(next.pad_style));
  if (next.pad_volume !== prev?.pad_volume) padsController.setVolume(next.pad_volume);
  if ((prev?.pads_on ?? false) !== (next.pads_on ?? false)) {
    if (next.pads_on) padsController.start(key);
    else padsController.stop();
  }
  if ((prev?.interlude ?? false) !== next.interlude) {
    void padsController.setInterlude(next.interlude, session.current.song_id, key);
  }
}

/**
 * Write-back: watch the engine; when auto-advance moves the playhead into a
 * new section of the session's current song, write section_index to the
 * session (last-write-wins, like any presenter). Returns an unsubscribe.
 */
export function wireWriteBack(client: SessionClient): () => void {
  let lastWritten = -1;
  return engine.subscribe((s: EngineState) => {
    const session = client.snapshot;
    if (!session) return;
    if (!s.auto_advance || s.yielded || !s.transport.playing) return;
    if (s.transport.song_id === null || s.transport.song_id !== session.current.song_id) return;
    const section = s.transport.current_section;
    if (section === session.current.section_index || section === lastWritten) return;
    lastWritten = section;
    client.setCurrent({ section_index: section });
  });
}
