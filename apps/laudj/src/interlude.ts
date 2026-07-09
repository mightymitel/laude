/**
 * Interlude progression for a song: the 4 heaviest chords from the extracted
 * performance chords (weighted by duration, ordered by first appearance) —
 * so the pads' instrumental interlude actually plays THIS song's harmony.
 * Falls back to the generic I–V–vi–IV table when no chord data exists.
 */
import type { ChordEvent } from '@laude/song-model';
import { defaultInterlude } from '@laude/pad-engine';
import { fetchPerformance, performanceIdFor } from './studio';

const cache = new Map<string, string[]>();

export async function interludeProgression(songId: string | null, key: string): Promise<string[]> {
  if (!songId) return defaultInterlude(key);
  const cached = cache.get(songId);
  if (cached) return cached;
  try {
    const progression = await fromPerformanceChords(songId);
    if (progression.length >= 2) {
      cache.set(songId, progression);
      return progression;
    }
  } catch (err) {
    console.warn(`LauDJ: no chord data for ${songId}, using the generic interlude`, err);
  }
  return defaultInterlude(key);
}

async function fromPerformanceChords(songId: string): Promise<string[]> {
  const perfId = await performanceIdFor(songId);
  if (!perfId) return [];
  const detail = await fetchPerformance(perfId);
  const events: ChordEvent[] = detail?.chords ?? [];

  const weights = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const next = events[i + 1];
    const span = (next ? next.start_s : event.start_s + 4) - event.start_s;
    weights.set(event.chord, (weights.get(event.chord) ?? 0) + Math.max(0, span));
    if (!firstSeen.has(event.chord)) firstSeen.set(event.chord, event.start_s);
  }

  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([chord]) => chord)
    .sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0));
}
