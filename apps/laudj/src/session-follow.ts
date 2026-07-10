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
import { renderChordPro } from '@laude/chords';
import type { EngineState } from '@laude/laudj-control-protocol';
import { partIndexFor } from '@laude/session';
import type { DjManifestEntry, DjMode, EmbeddedSong, EmbeddedSongPart, SessionChange, SessionClient, SessionState } from '@laude/session';
import type { CompanionDirectives, LocalSongDetail, Presenter, WorkPartRef } from '@laude/song-model';
import { engine, padEngine } from './engine';
import { padsController, padStyleOf } from './pads-controller';
import { fetchCatalog, fetchSongDetail } from './studio';

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

/** DJ-local chart → by-value session song (Flow 5: display AND audio come
 * from the DJ). Parts keep degree tokens in brackets — the same shape the
 * library's embedded parts carry. */
export function chartToEmbedded(detail: LocalSongDetail): EmbeddedSong {
  const rendered = renderChordPro(detail.chordpro, { notation: 'nashville' });
  const counters = new Map<string, number>();
  const parts: EmbeddedSongPart[] = rendered.sections.map((section, index) => {
    const type = section.type === 'chorus' ? 'chorus' : section.type === 'bridge' ? 'bridge' : 'verse';
    const n = (counters.get(type) ?? 0) + 1;
    counters.set(type, n);
    return {
      id: `${type === 'chorus' ? 'C' : type === 'bridge' ? 'B' : 'V'}${n}`,
      type,
      index,
      lines: section.lines.map((line) => ({
        text: line.items
          .map((item) => (item.chord ? `[${item.chord}]${item.lyrics}` : item.lyrics))
          .join(''),
      })),
    };
  });
  return {
    id: detail.local_song_id,
    title: detail.title,
    defaultKey: detail.analysis_key,
    parts,
  };
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
    this.unsubs.push(this.client.onDjRequest((localSongId) => void this.fulfillRequest(localSongId)));
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

  /** Flow 5: the leader requested one of OUR local-only songs — transmit it
   * by-value (ephemeral: it rides session state, never the library) and make
   * it current. Display and audio both come from this laptop. */
  private async fulfillRequest(localSongId: string): Promise<void> {
    try {
      const detail = await fetchSongDetail(localSongId);
      if (!detail) return; // not our song (another DJ may hold it)
      const catalog = await fetchCatalog();
      const entry = catalog.find((s) => s.local_song_id === localSongId);
      const songId = entry?.song_id ?? localSongId;
      const embedded = { ...chartToEmbedded(detail), id: songId };
      const session = this.client.snapshot();
      const playlist = session?.sessionPlaylist ?? [];
      const withSong = playlist.some((i) => i.songId === songId)
        ? playlist
        : [
            ...playlist,
            {
              id: `dj-${localSongId}`,
              songId,
              key: entry?.key ?? detail.analysis_key,
              song: embedded,
              temporary: true,
            },
          ];
      this.client.send({
        current: { song_id: songId, section_index: 0, effective_key: entry?.key ?? detail.analysis_key },
        currentSong: embedded,
        sessionPlaylist: withSong,
      });
      engine.send({ type: 'load_song', song_id: songId });
    } catch (err) {
      console.warn('LauDJ: by-value request failed', err);
    }
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
    padEngine.setKey(session.current.effective_key);
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
    const map = this.partMaps.get(s.transport.song_id) ?? [];
    const ref = map[section] ?? null;
    this.lastAnnounced = section;
    // The DJ knows its ACTUAL next mapped part (WP-117): the first mapped
    // section after the playhead — truth for the stage viewport's "next".
    const nextRef = map.slice(section + 1).find((r) => r !== null) ?? null;
    const target =
      ref === null ? 'instrumental' : partIndexFor(session.currentSong?.parts ?? [], ref);
    if (target === null || target === session.current.section_index) return;
    this.client.setCurrent({ section_index: target, next_part: nextRef });
  }
}

function applyCompanion(prev: CompanionDirectives | null, session: SessionState): void {
  const next = session.companion;
  const key = session.current.effective_key;
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
