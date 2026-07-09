/**
 * The ONE local-library contract (WP-109, DEC-70). Three places a song lives
 * offline — Studio's SQLite local_songs, a browser offline library, and a
 * playlist's by-value blobs — are ONE OBJECT at different scales:
 *
 *  - the browser store is NOT a pure cache: a guest can author a local song
 *    that has never existed in the cloud (no global_song_id), promotable to
 *    private on sign-in (DEC-27);
 *  - a playlist's by-value song blob becomes an IMPORT into this store, not
 *    a fourth representation;
 *  - Studio's SQLite schema is a SUPERSET (performances, sections, beatgrid,
 *    audio_files, section_part_map) and is retrofitted behind this same
 *    interface later (ticket 78 reads through it in LAN mode).
 */
import type { Lang } from '@laude/song-model';

export interface LocalLibrarySong {
  /** Local id — the identity even when the song has never been in the cloud. */
  id: string;
  global_song_id: string | null;
  link_state: 'local' | 'linked';
  title: string;
  author: string | null;
  language: Lang;
  /** The chart: Nashville degrees + head {key:} reference (DEC-45/46). */
  chordpro: string;
  /** The reference key local authoring/rendering defaults to. */
  analysis_key: string;
  verified: boolean;
  /** How the song got here — guest-authored, offline download, by-value import. */
  origin: 'authored' | 'downloaded' | 'imported';
  created_at: string;
  updated_at: string;
}

export interface LocalSongLink {
  song_id: string;
  related_song_id: string;
  relation_type: 'translation' | 'medley' | 'alternate_arrangement';
}

/** Where a local song stands relative to the cloud. */
export interface SyncState {
  song_id: string;
  state: 'local-only' | 'synced' | 'dirty';
  synced_at: string | null;
}

/** Minimal structural view of a session's by-value song (no dependency on
 * @laude/session — the shapes are structurally compatible). */
export interface EmbeddedSongLike {
  id: string;
  title: string;
  author?: string;
  defaultKey: string;
  parts: { type: string; lines: { text: string }[] }[];
}

export interface LocalLibrary {
  listSongs(): Promise<LocalLibrarySong[]>;
  getSong(id: string): Promise<LocalLibrarySong | null>;
  saveSong(song: LocalLibrarySong): Promise<void>;
  deleteSong(id: string): Promise<void>;

  listFavorites(): Promise<string[]>;
  setFavorite(songId: string, on: boolean): Promise<void>;

  listLinks(): Promise<LocalSongLink[]>;
  saveLink(link: LocalSongLink): Promise<void>;

  getSyncState(songId: string): Promise<SyncState | null>;
  setSyncState(state: SyncState): Promise<void>;

  /** Clone a by-value session/playlist song INTO the library (never a live
   * reference; origin 'imported'; keeps a global link when the blob has a
   * library identity). */
  importEmbedded(song: EmbeddedSongLike, language: Lang): Promise<LocalLibrarySong>;
}

/** Serialize an embedded song's parts back into a degree chart container. */
export function embeddedToChordpro(song: EmbeddedSongLike): string {
  const out: string[] = [`{title: ${song.title}}`, `{key: ${song.defaultKey}}`];
  const counters = new Map<string, number>();
  for (const part of song.parts) {
    const n = (counters.get(part.type) ?? 0) + 1;
    counters.set(part.type, n);
    const kind = part.type === 'chorus' ? 'chorus' : part.type === 'bridge' ? 'bridge' : 'verse';
    const label =
      kind === 'chorus' ? 'Chorus' : kind === 'bridge' ? 'Bridge' : `Verse ${n}`;
    out.push('', `{start_of_${kind}: ${label}}`);
    for (const line of part.lines) out.push(line.text);
    out.push(`{end_of_${kind}}`);
  }
  return out.join('\n') + '\n';
}
