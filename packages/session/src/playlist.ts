/**
 * The Playlist as a first-class PORTABLE object (DEC-38, ticket 88).
 * ONE envelope, three uses: session transport · export file · saved cloud
 * playlist. Songs travel BY-VALUE (bare global IDs would break private,
 * DJ-local, imported and offline songs). Sessions own a COPY (clone-in,
 * never a live reference). Chords inside ride the storage format (degrees +
 * reference key) and render per-device.
 */
import type { EmbeddedSong, SessionPlaylistItem } from './types';

/**
 * v2 (WP-116): EmbeddedSong.originalKey became defaultKey (WP-111). v2 is
 * simply THE format — no v1 files exist outside dev machines, so there is no
 * migration path (DEC-98); older versions are rejected with a clear error.
 */
export const PLAYLIST_FORMAT_VERSION = 2;

export interface PortablePlaylist {
  format_version: number;
  name: string;
  exported_at: string; // ISO
  songs: SessionPlaylistItem[];
}

/** Snapshot a session's working list into the portable envelope (deep copy —
 * the export must not alias live session state). */
export function toPortable(name: string, items: SessionPlaylistItem[]): PortablePlaylist {
  return {
    format_version: PLAYLIST_FORMAT_VERSION,
    name,
    exported_at: new Date().toISOString(),
    songs: structuredClone(items),
  };
}

export type ParseResult =
  | { ok: true; name: string; items: SessionPlaylistItem[] }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function songOf(v: unknown): EmbeddedSong | undefined {
  if (!isRecord(v)) return undefined;
  if (typeof v.id !== 'string' || typeof v.title !== 'string') return undefined;
  const defaultKey = typeof v.defaultKey === 'string' ? v.defaultKey : undefined;
  if (defaultKey === undefined || !Array.isArray(v.parts)) return undefined;
  const parts: EmbeddedSong['parts'] = [];
  for (const [index, part] of v.parts.entries()) {
    if (!isRecord(part) || !Array.isArray(part.lines)) return undefined;
    parts.push({
      id: typeof part.id === 'string' ? part.id : `P${index + 1}`,
      type: typeof part.type === 'string' ? part.type : 'verse',
      index: typeof part.index === 'number' ? part.index : index,
      lines: part.lines
        .filter((l): l is Record<string, unknown> => isRecord(l))
        .map((l) => ({ text: typeof l.text === 'string' ? l.text : '' })),
    });
  }
  return {
    id: v.id,
    title: v.title,
    ...(typeof v.author === 'string' ? { author: v.author } : {}),
    defaultKey,
    parts,
  };
}

/**
 * Validate + hydrate an imported envelope. Exactly v2 parses; anything else
 * is rejected with a clear error (DEC-98: no migrations while no production
 * data exists); malformed entries fail the whole import (an honest error
 * beats a silently shortened set). Imported songs STAY by-value — linking is
 * offered elsewhere, never automatic.
 */
export function parsePortable(data: unknown): ParseResult {
  if (!isRecord(data)) return { ok: false, error: 'Not a playlist file' };
  if (typeof data.format_version !== 'number') {
    return { ok: false, error: 'Missing format_version — not a playlist export' };
  }
  if (data.format_version > PLAYLIST_FORMAT_VERSION) {
    return { ok: false, error: `Playlist format v${data.format_version} is newer than this app understands` };
  }
  if (data.format_version < PLAYLIST_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Playlist format v${data.format_version} is no longer supported — re-export it from a current app`,
    };
  }
  if (!Array.isArray(data.songs)) return { ok: false, error: 'Playlist file has no songs' };

  const items: SessionPlaylistItem[] = [];
  for (const [i, raw] of data.songs.entries()) {
    if (!isRecord(raw) || typeof raw.songId !== 'string') {
      return { ok: false, error: `Song #${i + 1} is malformed` };
    }
    const song = songOf(raw.song);
    if (raw.song !== undefined && song === undefined) {
      return { ok: false, error: `Song #${i + 1} has a malformed by-value payload` };
    }
    // Omit absent fields entirely (never `undefined`) so export → import is
    // a byte-honest round-trip.
    items.push({
      id: typeof raw.id === 'string' ? raw.id : `import-${i}-${raw.songId}`,
      songId: raw.songId,
      ...(typeof raw.key === 'string' ? { key: raw.key } : {}),
      ...(typeof raw.arrangement === 'string' ? { arrangement: raw.arrangement } : {}),
      ...(song !== undefined ? { song } : {}),
    });
  }
  return {
    ok: true,
    name: typeof data.name === 'string' ? data.name : 'Imported playlist',
    items,
  };
}
