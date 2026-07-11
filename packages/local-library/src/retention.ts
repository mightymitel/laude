/**
 * Retention operations (WP-158) — pure logic over the LocalLibrary contract,
 * shared by every adapter. Two classes, one store:
 *  - pinned: a user-managed download; NEVER auto-evicted.
 *  - cached: auto-populated recents; LRU-evicted past a cap.
 * Only origin 'downloaded' rows are eviction candidates — guest-authored and
 * imported songs are the only copy of themselves and are permanent.
 */
import type { LocalLibrary, RetentionRow } from './types';

/** Recents cap (spec open question 1: default 20, config in one place). */
export const DEFAULT_RECENTS_CAP = 20;

export async function pinSong(lib: LocalLibrary, songId: string, now: string): Promise<void> {
  await lib.setRetention({ song_id: songId, klass: 'pinned', last_opened_at: now });
}

/**
 * Remove a download: the pinned copy goes; content that exists for another
 * reason (authored/imported) only loses its retention row.
 */
export async function removeDownload(lib: LocalLibrary, songId: string): Promise<void> {
  const song = await lib.getSong(songId);
  await lib.deleteRetention(songId);
  if (song !== null && song.origin === 'downloaded') {
    await lib.deleteSong(songId);
  }
}

/**
 * Mark a song opened. Downloads keep their pin (the timestamp still moves —
 * it is harmless and useful telemetry); other 'downloaded' rows become/renew
 * 'cached'; authored/imported content is permanent and takes no retention row.
 * Runs the LRU sweep after every touch.
 */
export async function touchRecent(
  lib: LocalLibrary,
  songId: string,
  now: string,
  cap: number = DEFAULT_RECENTS_CAP,
): Promise<void> {
  const song = await lib.getSong(songId);
  if (song === null || song.origin !== 'downloaded') return;
  const existing = (await lib.listRetention()).find((r) => r.song_id === songId);
  await lib.setRetention({
    song_id: songId,
    klass: existing?.klass === 'pinned' ? 'pinned' : 'cached',
    last_opened_at: now,
  });
  await evictRecents(lib, cap);
}

/** Evict cached rows past the cap, oldest-opened first. Pinned untouched. */
export async function evictRecents(lib: LocalLibrary, cap: number): Promise<void> {
  const cached = (await lib.listRetention())
    .filter((r) => r.klass === 'cached')
    .sort((a, b) => b.last_opened_at.localeCompare(a.last_opened_at));
  for (const row of cached.slice(cap)) {
    const song = await lib.getSong(row.song_id);
    await lib.deleteRetention(row.song_id);
    if (song !== null && song.origin === 'downloaded') {
      await lib.deleteSong(row.song_id);
    }
  }
}

/** Retention rows as a map for quick UI lookups. */
export async function retentionMap(lib: LocalLibrary): Promise<Map<string, RetentionRow>> {
  return new Map((await lib.listRetention()).map((r) => [r.song_id, r]));
}
