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
 * v2 (WP-116): EmbeddedSong.originalKey became defaultKey (WP-111). v1 files
 * naming originalKey are EXPLICITLY migrated on import — never silently
 * aliased — so no two incompatible shapes share a version number.
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

function songOf(v: unknown, formatVersion: number): EmbeddedSong | undefined {
  if (!isRecord(v)) return undefined;
  if (typeof v.id !== 'string' || typeof v.title !== 'string') return undefined;
  // v1 migration: the field was named originalKey before WP-111.
  const defaultKey =
    typeof v.defaultKey === 'string'
      ? v.defaultKey
      : formatVersion === 1 && typeof v.originalKey === 'string'
        ? v.originalKey
        : undefined;
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
 * Validate + hydrate an imported envelope. v2 files parse losslessly; v1
 * files are explicitly migrated (originalKey → defaultKey); malformed
 * entries fail the whole import (an honest error beats a silently shortened
 * set). Imported songs STAY by-value — linking is offered elsewhere, never
 * automatic.
 */
export function parsePortable(data: unknown): ParseResult {
  if (!isRecord(data)) return { ok: false, error: 'Not a playlist file' };
  if (typeof data.format_version !== 'number') {
    return { ok: false, error: 'Missing format_version — not a playlist export' };
  }
  if (data.format_version > PLAYLIST_FORMAT_VERSION) {
    return { ok: false, error: `Playlist format v${data.format_version} is newer than this app understands` };
  }
  if (!Array.isArray(data.songs)) return { ok: false, error: 'Playlist file has no songs' };

  const items: SessionPlaylistItem[] = [];
  for (const [i, raw] of data.songs.entries()) {
    if (!isRecord(raw) || typeof raw.songId !== 'string') {
      return { ok: false, error: `Song #${i + 1} is malformed` };
    }
    const song = songOf(raw.song, data.format_version);
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
