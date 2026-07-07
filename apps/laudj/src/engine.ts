/**
 * The one LaudjEngine + PadEngine pair the whole console talks to, plus the
 * song loader: Firestore (emulator) songs → EngineSong registrations, with a
 * hardcoded fallback when the emulator is empty/unreachable after 3s.
 *
 * LaudjEngine plays real stems via Web Audio when a performance has them
 * (falling back per-song to simulated playback); the pads ride the same
 * AudioContext, attached to the shared PadEngine on the first audible gesture.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { PadEngine } from '@laude/pad-engine';
import { ALL_STEMS, COLLECTIONS, type StemName } from '@laude/song-model';
import { LaudjEngine, type EngineSong } from './audio-engine';
import { db } from './firebase';

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
// Firestore → EngineSong mapping (narrowing helpers, no casts)
// ---------------------------------------------------------------------------

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asStemNames(v: unknown): StemName[] {
  if (!Array.isArray(v)) return [];
  return ALL_STEMS.filter((stem) => v.includes(stem));
}

function asNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

interface LoadedPerformance {
  id: string;
  start_s: number;
  end_s: number;
  key: string | undefined;
  stems: StemName[];
  key_variants: number[];
}

function toLoadedPerformance(id: string, data: Record<string, unknown>): LoadedPerformance {
  return {
    id,
    start_s: asNumber(data.start_s) ?? 0,
    end_s: asNumber(data.end_s) ?? 0,
    key: asString(data.key),
    stems: asStemNames(data.stems),
    key_variants: asNumberArray(data.key_variants),
  };
}

async function loadPerformance(
  songId: string,
  preferredId: string | undefined,
): Promise<LoadedPerformance | null> {
  if (preferredId) {
    const snap = await getDoc(doc(db, COLLECTIONS.performances, preferredId));
    if (snap.exists()) return toLoadedPerformance(snap.id, snap.data());
  }
  const res = await getDocs(
    query(collection(db, COLLECTIONS.performances), where('song_id', '==', songId), limit(1)),
  );
  const first = res.docs[0];
  if (!first) return null;
  return toLoadedPerformance(first.id, first.data());
}

async function loadSections(
  performanceId: string,
  perfStart: number,
): Promise<{ label: string; start_s: number }[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTIONS.sections), where('performance_id', '==', performanceId)),
  );
  const rows = snap.docs.map((d) => {
    const data: Record<string, unknown> = d.data();
    return { label: asString(data.label) ?? '—', start_s: asNumber(data.start_s) ?? 0 };
  });
  if (rows.length === 0) return [];
  rows.sort((a, b) => a.start_s - b.start_s);
  // Section times may be absolute (within the source video) or already
  // performance-relative; if every section starts at/after the performance
  // start, treat them as absolute and rebase to 0.
  const offset = perfStart > 0 && rows[0].start_s >= perfStart ? perfStart : 0;
  return rows.map((r) => ({ label: r.label, start_s: r.start_s - offset }));
}

async function loadSongsFromFirestore(): Promise<EngineSong[]> {
  // The Laudasist `songs` rules only allow unauthenticated reads on public
  // docs, and an unconstrained collection query is denied outright — the
  // where() clause is what makes the query pass.
  const songsSnap = await getDocs(
    query(collection(db, COLLECTIONS.songs), where('visibility', '==', 'public')),
  );
  const songs = await Promise.all(
    songsSnap.docs.map(async (d): Promise<EngineSong> => {
      const data: Record<string, unknown> = d.data();
      const perf = await loadPerformance(d.id, asString(data.preferred_performance_id));
      const duration = perf && perf.end_s - perf.start_s > 0 ? perf.end_s - perf.start_s : 240;
      const sections = perf ? await loadSections(perf.id, perf.start_s) : [];
      return {
        song_id: d.id,
        title: asString(data.canonical_title) ?? d.id,
        key: perf?.key ?? asString(data.original_key) ?? 'C',
        duration_s: duration,
        sections,
        performance:
          perf && perf.stems.length > 0
            ? { id: perf.id, stems: perf.stems, key_variants: perf.key_variants }
            : undefined,
      };
    }),
  );
  return songs;
}

/**
 * Load emulator songs into the engine; fall back to mock songs when the
 * emulator is empty or hasn't answered within 3s (late results still register).
 */
export async function initSongs(): Promise<void> {
  const loading = loadSongsFromFirestore().catch((err: unknown) => {
    console.error('LauDJ: failed to load songs from the Firestore emulator', err);
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
