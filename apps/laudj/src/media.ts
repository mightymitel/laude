/**
 * Media loading for the real audio path: stem/key-variant files from the
 * Storage emulator (public download URLs) decoded to AudioBuffers, plus the
 * performance beatgrid from Firestore. Decoding runs on an OfflineAudioContext
 * so no autoplay-gated AudioContext is needed before the first user gesture.
 */
import { doc, getDoc } from 'firebase/firestore';
import { ALL_STEMS, COLLECTIONS, storagePaths, type StemName } from '@laude/song-model';
import { db } from './firebase';

/** Emulator-only bucket URL (PoC rule: never a real project). */
const STORAGE_ROOT = 'http://127.0.0.1:9199/v0/b/demo-laude.appspot.com/o';

/** Stems with pre-rendered key variants; drums always play the original. */
export const PITCHED_STEMS: StemName[] = ['vocals', 'bass', 'other'];

export type StemBuffers = Map<StemName, AudioBuffer>;

let decoder: OfflineAudioContext | null = null;

function getDecoder(): OfflineAudioContext {
  if (!decoder) decoder = new OfflineAudioContext(1, 1, 44100);
  return decoder;
}

async function fetchAndDecode(path: string): Promise<AudioBuffer> {
  const res = await fetch(`${STORAGE_ROOT}/${encodeURIComponent(path)}?alt=media`);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${path}`);
  const bytes = await res.arrayBuffer();
  // Mock-seeded placeholder "stems" are tiny text files: decodeAudioData
  // rejects and the engine falls back to simulated playback.
  return getDecoder().decodeAudioData(bytes);
}

/** Fetch + decode all four stems of a performance; rejects if any is unusable. */
export async function loadStemBuffers(songId: string, performanceId: string): Promise<StemBuffers> {
  const entries = await Promise.all(
    ALL_STEMS.map(async (stem): Promise<[StemName, AudioBuffer]> => [
      stem,
      await fetchAndDecode(storagePaths.stem(songId, performanceId, stem)),
    ]),
  );
  return new Map(entries);
}

/** Fetch + decode one pre-rendered key-variant stem. */
export function loadVariantBuffer(
  songId: string,
  performanceId: string,
  stem: StemName,
  semitones: number,
): Promise<AudioBuffer> {
  return fetchAndDecode(storagePaths.keyVariant(songId, performanceId, stem, semitones));
}

function asNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

/** Beat onset times (performance-relative seconds) or null (missing/unreadable doc). */
export async function loadBeatgrid(performanceId: string): Promise<number[] | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.beatgrid, performanceId));
    if (!snap.exists()) return null;
    const data: Record<string, unknown> = snap.data();
    const beats = asNumberArray(data.beats);
    return beats.length > 0 ? beats : null;
  } catch (err) {
    console.warn('LauDJ: beatgrid load failed — quantized launches use the countdown fallback', err);
    return null;
  }
}
