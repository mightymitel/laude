/**
 * LauDJ ↔ session glue (presenter role × dj type — DEC-43).
 *
 * MODE IS A CONSEQUENCE OF WHO ACTS, not a setting:
 *  - COMPANION: pads/drones/interludes; reads the session key + companion
 *    directives; IGNORES parts; works for any song.
 *  - PLAYBACK (driving): the DJ advances its own sections, translates each
 *    through the ONE-WAY section → work-part mapping (stored with the local
 *    performance) and announces the part to the session as a presenter.
 *
 * Transitions:
 *  - a HUMAN presenter changing musical intent DEMOTES a driving DJ to
 *    companion — transport stops, the pad holds the new key;
 *  - starting playback locally PROMOTES it to driving.
 *  The DJ never FOLLOWS parts. Echo suppression: our own announcements come
 *  back with `external === false` (writer id = ours), so a driving DJ never
 *  observes its own writes and demotes itself.
 */
import type { EngineState } from '@laude/laudj-control-protocol';
import type { DjManifestEntry, DjMode, EmbeddedSongPart, SessionChange, SessionClient, SessionState } from '@laude/session';
import type { CompanionDirectives, Presenter, WorkPartRef } from '@laude/song-model';
import { engine, padEngine } from './engine';
import { padsController, padStyleOf } from './pads-controller';
import { fetchCatalog } from './studio';

export const RELAY_URL: string =
  typeof import.meta.env?.VITE_RELAY_URL === 'string'
    ? import.meta.env.VITE_RELAY_URL
    : 'http://localhost:3001'; // the relay is a module inside the api (DEC-52)

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

/**
 * Resolve a work-part REF (label + ordinal, DEC-56) to an index into the
 * session song's embedded parts — the session contract still addresses parts
 * by index. Label classification mirrors Studio's ingest heuristic (RO + EN).
 */
export function partIndexFor(parts: EmbeddedSongPart[], ref: WorkPartRef): number | null {
  const classify = (label: string): { kind: string; n: number } | null => {
    const lower = label.trim().toLowerCase();
    const n = Number(/(\d+)/.exec(lower)?.[1] ?? ref.ordinal);
    if (/(chorus|refren)/.test(lower)) return { kind: 'chorus', n };
    if (/(bridge|punte)/.test(lower)) return { kind: 'bridge', n };
    if (/(verse|strofa|vers)/.test(lower)) return { kind: 'verse', n };
    return null;
  };
  const wanted = classify(ref.label);
  if (!wanted) return null;
  let occurrence = 0;
  for (const [i, part] of parts.entries()) {
    if (part.type !== wanted.kind) continue;
    occurrence += 1;
    if (occurrence === wanted.n) return i;
  }
  return null;
}

export class DjSessionController {
  private mode: DjMode = 'companion';
  private modeListeners = new Set<(mode: DjMode) => void>();
  /** song_id → work-part REF per engine-section index (from the catalog);
   * null = unaligned/proposed/instrumental → announce INSTRUMENTAL (DEC-62). */
  private partMaps = new Map<string, (WorkPartRef | null)[]>();
  private wasPlaying = false;
  private lastAnnounced = -1;
  private prevSession: SessionState | null = null;
  private engineState: EngineState | null = null;
  private unsubs: (() => void)[] = [];

  constructor(private readonly client: SessionClient) {}

  start(): void {
    this.unsubs.push(this.client.subscribe((change) => this.onSessionChange(change)));
    this.unsubs.push(engine.subscribe((s) => this.onEngineState(s)));
    void fetchCatalog()
      .then((catalog) => {
        for (const song of catalog) {
          this.partMaps.set(
            song.song_id,
            song.sections.map((sec) => sec.part),
          );
        }
      })
      .catch((err: unknown) => console.warn('LauDJ: catalog part maps unavailable', err));
  }

  stop(): void {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
  }

  currentMode(): DjMode {
    return this.mode;
  }

  onMode(listener: (mode: DjMode) => void): () => void {
    this.modeListeners.add(listener);
    listener(this.mode);
    return () => this.modeListeners.delete(listener);
  }

  private setMode(mode: DjMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.client.sendMode(mode);
    this.modeListeners.forEach((fn) => fn(mode));
  }

  // --- session → DJ ---------------------------------------------------------

  private onSessionChange(change: SessionChange): void {
    const { state: session, external, writerKind } = change;
    const prev = this.prevSession;
    this.prevSession = session;

    const currentChanged =
      prev !== null && JSON.stringify(prev.current) !== JSON.stringify(session.current);

    // DEMOTION: a human (or mic, or unknown) presenter changed musical intent
    // while we were driving → companion. Transport stops; the pad holds the
    // NEW key (setKey below). Our own announcements arrive external=false.
    if (external && currentChanged && this.mode === 'playback') {
      const humanActed = writerKind === null || writerKind === 'human' || writerKind === 'mic';
      if (humanActed) {
        engine.send({ type: 'pause' });
        this.setMode('companion');
      }
    }

    // COMPANION duties for any mode: mirror song (prepares stems) + key to
    // pads. The DJ never follows PARTS (section_index is ignored here).
    const now = this.engineState;
    if (now && session.current.song_id && session.current.song_id !== now.transport.song_id) {
      engine.send({ type: 'load_song', song_id: session.current.song_id });
    }
    padEngine.setKey(session.current.key);
    applyCompanion(prev?.companion ?? null, session);
  }

  // --- DJ → session ----------------------------------------------------------

  private onEngineState(s: EngineState): void {
    this.engineState = s;
    const session = this.client.snapshot();

    // PROMOTION: starting playback is the act that makes the DJ the driver.
    if (s.transport.playing && !this.wasPlaying) {
      this.setMode('playback');
      this.lastAnnounced = -1;
    }
    this.wasPlaying = s.transport.playing;

    if (this.mode !== 'playback' || !s.transport.playing || !session) return;
    if (s.transport.song_id === null || s.transport.song_id !== session.current.song_id) return;

    // Translate the engine section into a WORK part via the one-way mapping
    // (ref → session part index at announce time — DEC-56). A section with
    // no accepted part announces the explicit INSTRUMENTAL value (DEC-62):
    // never a stale previous part, never a silent hold.
    const section = s.transport.current_section;
    if (section === this.lastAnnounced) return;
    const ref = this.partMaps.get(s.transport.song_id)?.[section] ?? null;
    this.lastAnnounced = section;
    const target =
      ref === null ? 'instrumental' : partIndexFor(session.currentSong?.parts ?? [], ref);
    if (target === null || target === session.current.section_index) return;
    this.client.setCurrent({ section_index: target });
  }
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
