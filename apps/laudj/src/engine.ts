/**
 * The one LaudjEngine + PadEngine pair the whole console talks to, plus the
 * song loader: LaudStudio's local catalog → EngineSong registrations, with a
 * hardcoded fallback when the local service is empty/unreachable after 3s.
 *
 * LaudjEngine plays real stems via Web Audio when a performance has them
 * (falling back per-song to simulated playback); the pads ride the same
 * AudioContext, attached to the shared PadEngine on the first audible gesture.
 */
import { PadEngine } from '@laude/pad-engine';
import type { LocalCatalogSong } from '@laude/song-model';
import { LaudjEngine, type EngineSong } from './audio-engine';
import { fetchCatalog } from './studio';

/** Shared pad instrument: the UI drives its state; audio attaches on first gesture. */
export const padEngine = new PadEngine();
export const engine = new LaudjEngine({
  onAudioContext: (ctx) => padEngine.attachAudio(ctx),
});

// ---------------------------------------------------------------------------
// Registered-song registry (the engine keeps its song map private, and the
// song picker needs the list). Tiny external store for React.
// ---------------------------------------------------------------------------

let registeredSongs: EngineSong[] = [];
let fallbackUsed = false;
const songListeners = new Set<() => void>();

export function getRegisteredSongs(): EngineSong[] {
  return registeredSongs;
}

export function isFallbackUsed(): boolean {
  return fallbackUsed;
}

export function subscribeSongs(listener: () => void): () => void {
  songListeners.add(listener);
  return () => songListeners.delete(listener);
}

let firstSongAutoLoaded = false;

function register(songs: EngineSong[]): void {
  const fresh = songs.filter((s) => !registeredSongs.some((r) => r.song_id === s.song_id));
  if (fresh.length === 0) return;
  fresh.forEach((s) => engine.registerSong(s));
  registeredSongs = [...registeredSongs, ...fresh];
  songListeners.forEach((fn) => fn());
  // Auto-load the first song so the console is alive out of the box.
  if (!firstSongAutoLoaded) {
    firstSongAutoLoaded = true;
    engine.send({ type: 'load_song', song_id: fresh[0].song_id });
  }
}

// ---------------------------------------------------------------------------
// Fallback mock songs (TODO/mock: placeholder titles, not real library data)
// ---------------------------------------------------------------------------

const FALLBACK_SONGS: EngineSong[] = [
  {
    song_id: 'mock-song-1',
    title: 'Cât de mare ești Tu (mock)',
    key: 'G',
    duration_s: 252,
    sections: [
      { label: 'Intro', start_s: 0 },
      { label: 'Strofa 1', start_s: 12 },
      { label: 'Refren', start_s: 48 },
      { label: 'Strofa 2', start_s: 84 },
      { label: 'Refren', start_s: 120 },
      { label: 'Bridge', start_s: 156 },
      { label: 'Refren', start_s: 192 },
      { label: 'Outro', start_s: 228 },
    ],
  },
  {
    song_id: 'mock-song-2',
    title: 'Way Maker (mock)',
    key: 'E',
    duration_s: 300,
    sections: [
      { label: 'Intro', start_s: 0 },
      { label: 'Verse 1', start_s: 16 },
      { label: 'Chorus', start_s: 60 },
      { label: 'Verse 2', start_s: 104 },
      { label: 'Chorus', start_s: 148 },
      { label: 'Bridge', start_s: 200 },
      { label: 'Chorus', start_s: 248 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Catalog → EngineSong mapping
// ---------------------------------------------------------------------------

function toEngineSong(entry: LocalCatalogSong): EngineSong {
  // Catalog section times are performance-relative (0-based) by contract.
  return {
    song_id: entry.song_id,
    title: entry.title,
    key: entry.key,
    duration_s: entry.duration_s > 0 ? entry.duration_s : 240,
    sections: entry.sections,
    performance:
      entry.performance_id !== null && entry.stems.length > 0
        ? { id: entry.performance_id, stems: entry.stems, key_variants: entry.key_variants }
        : undefined,
  };
}

/**
 * Load the LaudStudio catalog into the engine; fall back to mock songs when
 * the service is empty or hasn't answered within 3s (late results still register).
 */
export async function initSongs(): Promise<void> {
  const loading = fetchCatalog()
    .then((catalog) => catalog.map(toEngineSong))
    .catch((err: unknown) => {
      console.error('LauDJ: failed to load the LaudStudio catalog', err);
      return [];
    });
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));
  const result = await Promise.race([loading, timeout]);

  if (result === 'timeout') {
    fallbackUsed = true;
    register(FALLBACK_SONGS);
    const late = await loading;
    if (late.length > 0) register(late);
  } else if (result.length === 0) {
    fallbackUsed = true;
    register(FALLBACK_SONGS);
  } else {
    register(result);
  }
}
