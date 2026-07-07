/**
 * Interlude progression for a song: the 4 heaviest chords from the extracted
 * performance chords (weighted by duration, ordered by first appearance) —
 * so the pads' instrumental interlude actually plays THIS song's harmony.
 * Falls back to the generic I–V–vi–IV table when no chord data exists.
 */
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { COLLECTIONS } from '@laude/song-model';
import { defaultInterlude } from '@laude/pad-engine';
import { db } from './firebase';

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
  const snap = await getDoc(doc(db, COLLECTIONS.chords, perfId));
  const data = snap.data();
  const events = Array.isArray(data?.data) ? data.data : [];

  const weights = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (let i = 0; i < events.length; i += 1) {
    const event = asChordEvent(events[i]);
    if (!event) continue;
    const next = asChordEvent(events[i + 1]);
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

async function performanceIdFor(songId: string): Promise<string | null> {
  const songSnap = await getDoc(doc(db, COLLECTIONS.songs, songId));
  const preferred = songSnap.data()?.preferred_performance_id;
  if (typeof preferred === 'string' && preferred.length > 0) return preferred;
  const res = await getDocs(
    query(collection(db, COLLECTIONS.performances), where('song_id', '==', songId), limit(1)),
  );
  return res.docs[0]?.id ?? null;
}

function asChordEvent(value: unknown): { start_s: number; chord: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>; // safe: object narrowing above, reads are typeof-checked below
  return typeof record.start_s === 'number' && typeof record.chord === 'string'
    ? { start_s: record.start_s, chord: record.chord }
    : null;
}
