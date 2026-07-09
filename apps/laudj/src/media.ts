/**
 * Media loading for the real audio path: stem/key-variant files from the
 * LaudStudio local service decoded to AudioBuffers, plus the performance
 * beat grid. Decoding runs on an OfflineAudioContext so no autoplay-gated
 * AudioContext is needed before the first user gesture.
 */
import { ALL_STEMS, type StemName } from '@laude/song-model';
import { audioUrl, fetchPerformance } from './studio';

/** Stems with pre-rendered key variants; drums always play the original. */
export const PITCHED_STEMS: StemName[] = ['vocals', 'bass', 'other'];

export type StemBuffers = Map<StemName, AudioBuffer>;

let decoder: OfflineAudioContext | null = null;

function getDecoder(): OfflineAudioContext {
  if (!decoder) decoder = new OfflineAudioContext(1, 1, 44100);
  return decoder;
}

async function fetchAndDecode(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const bytes = await res.arrayBuffer();
  // Songs without real audio have no files at all (404 above); a corrupt file
  // rejects here — either way the engine falls back to simulated playback.
  return getDecoder().decodeAudioData(bytes);
}

/** Fetch + decode all four stems of a performance; rejects if any is unusable. */
export async function loadStemBuffers(performanceId: string): Promise<StemBuffers> {
  const entries = await Promise.all(
    ALL_STEMS.map(async (stem): Promise<[StemName, AudioBuffer]> => [
      stem,
      await fetchAndDecode(audioUrl.stem(performanceId, stem)),
    ]),
  );
  return new Map(entries);
}

/** Fetch + decode one pre-rendered key-variant stem. */
export function loadVariantBuffer(
  performanceId: string,
  stem: StemName,
  semitones: number,
): Promise<AudioBuffer> {
  return fetchAndDecode(audioUrl.keyVariant(performanceId, stem, semitones));
}

/** Beat onset times (performance-relative seconds) or null (no grid). */
export async function loadBeatgrid(performanceId: string): Promise<number[] | null> {
  try {
    const detail = await fetchPerformance(performanceId);
    const beats = detail?.beats ?? [];
    return beats.length > 0 ? beats : null;
  } catch (err) {
    console.warn('LauDJ: beatgrid load failed — quantized launches use the countdown fallback', err);
    return null;
  }
}
