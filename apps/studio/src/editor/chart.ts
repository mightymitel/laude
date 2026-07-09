/**
 * Chart editing rules (WP-104, Studio Editor spec). The boundary is
 * OWNERSHIP, not domain (DEC-68): local_songs.chordpro is a work-level
 * artifact and Studio is where it is hand-corrected before minting.
 *
 *   local song                       → chart EDITABLE
 *   linked song                      → chart LOCKED
 *   linked + you own the global song → editable, edits PUSH to Laudasist
 *
 * Escape hatches: owner override (above) and unlink (service/link.ts).
 * There is no fork verb.
 */
import { rekeyChordPro, validateDegreeChart } from '@laude/chords';
import { COLLECTIONS } from '@laude/song-model';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import '../env';
import { PROJECT_ID } from '../env';
import { alignPerformance } from '../service/align';
import { requireUid } from '../service/auth';
import { chartSnapshotParts } from '../service/snapshot';
import type { LocalStore, LocalSongRow } from '../store';

export type ChartAccess = 'editable' | 'locked' | 'owner';

export interface ChartUpdateResult {
  ok: boolean;
  access?: ChartAccess;
  pushed?: boolean;
  error?: string;
}

/** What the signed-in (or signed-out) user may do with this song's chart. */
export async function chartAccess(song: LocalSongRow): Promise<ChartAccess> {
  if (song.link_state !== 'linked' || song.global_song_id === null) return 'editable';
  let uid: string;
  try {
    uid = requireUid();
  } catch {
    return 'locked';
  }
  const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
  const doc = await getFirestore(app)
    .collection(COLLECTIONS.songs)
    .doc(song.global_song_id)
    .get();
  return doc.exists && doc.get('ownerId') === uid ? 'owner' : 'locked';
}

/** Persist an edited chart under the lock rules. First editor touch writes
 * derived_chordpro and never otherwise (DEC-61). */
export async function setChart(
  store: LocalStore,
  localSongId: string,
  chordpro: string,
): Promise<ChartUpdateResult> {
  const song = store.getLocalSong(localSongId);
  if (!song) return { ok: false, error: `unknown local song ${localSongId}` };
  const errors = validateDegreeChart(chordpro);
  if (errors.length > 0) {
    return { ok: false, error: `invalid degree chart: ${errors[0]!.message}` };
  }
  const access = await chartAccess(song);
  if (access === 'locked') {
    return { ok: false, access, error: 'chart is locked — unlink, or sign in as the owner' };
  }
  const now = new Date().toISOString();

  if (access === 'owner') {
    // Owner override: the edit pushes to Laudasist AND refreshes the local
    // snapshot — the global chart stays the single source for linked songs.
    const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
    const firestore = getFirestore(app);
    const lyricsSnap = await firestore
      .collection(COLLECTIONS.song_lyrics)
      .where('song_id', '==', song.global_song_id)
      .limit(1)
      .get();
    const lyricsDoc = lyricsSnap.docs[0];
    if (!lyricsDoc) return { ok: false, error: 'global song has no song_lyrics row to update' };
    await lyricsDoc.ref.update({ chordpro });
    const snapshot = chartSnapshotParts(chordpro);
    store.upsertLocalSong({
      ...song,
      chordpro,
      chart_source: 'snapshot',
      snapshot_parts: snapshot,
      snapshot_taken_at: now,
      updated_at: now,
    });
    for (const perf of store.listPerformances(localSongId)) {
      alignPerformance(store, perf.id, snapshot.parts);
    }
    return { ok: true, access, pushed: true };
  }

  // Local song: the edit is the chart, and the first touch promotes it to a
  // kept artifact so a later link is lossless (DEC-61).
  store.upsertLocalSong({
    ...song,
    chordpro,
    chart_source: 'derived',
    derived_chordpro: chordpro,
    updated_at: now,
  });
  return { ok: true, access, pushed: false };
}

/** RE-KEY (DEC-59/60): the detected key was wrong. Editable charts only —
 * rotating a community snapshot would diverge from the global chart. */
export async function rekeySong(
  store: LocalStore,
  localSongId: string,
  newKey: string,
): Promise<ChartUpdateResult> {
  const song = store.getLocalSong(localSongId);
  if (!song) return { ok: false, error: `unknown local song ${localSongId}` };
  const access = await chartAccess(song);
  if (access === 'locked') {
    return { ok: false, access, error: 'chart is locked — unlink, or sign in as the owner' };
  }
  let rotated: string;
  try {
    rotated = rekeyChordPro(song.chordpro, newKey);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const now = new Date().toISOString();
  store.upsertLocalSong({
    ...song,
    chordpro: rotated,
    analysis_key: newKey,
    // Hand-corrections ride along: the kept artifact rotates identically.
    derived_chordpro: song.derived_chordpro === null ? null : rekeyChordPro(song.derived_chordpro, newKey),
    updated_at: now,
  });
  return { ok: true, access };
}

export type MapReviewAction =
  | { action: 'accept'; part_label: string; part_ordinal: number }
  | { action: 'instrumental' }
  | { action: 'clear' };

/** Human review of one mapping row: accept a part, mark deliberately
 * instrumental, or clear back to unaligned. Low-confidence proposals are the
 * rows a UI surfaces; accepted rows are not re-asked (DEC-63). */
export function reviewMapRow(
  store: LocalStore,
  performanceId: string,
  sectionId: string,
  review: MapReviewAction,
): void {
  if (review.action === 'clear') {
    store.deleteSectionPartMapRow(sectionId);
    return;
  }
  if (review.action === 'instrumental') {
    store.setSectionPartMapRow(performanceId, {
      section_id: sectionId,
      part_label: null,
      part_ordinal: null,
      is_instrumental: true,
      accepted: true,
      confidence: 1,
      source: 'human',
    });
    return;
  }
  store.setSectionPartMapRow(performanceId, {
    section_id: sectionId,
    part_label: review.part_label,
    part_ordinal: review.part_ordinal,
    is_instrumental: false,
    accepted: true,
    confidence: 1,
    source: 'human',
  });
}
