/**
 * In-memory LocalLibrary — the contract's reference implementation. Used by
 * tests (the contract suite runs against any adapter) and as the SSR/no-IDB
 * fallback. Future adapters (Studio SQLite retrofit) must pass the same
 * contract tests.
 */
import type { Lang } from '@laude/song-model';
import {
  embeddedToChordpro,
  type EmbeddedSongLike,
  type LocalLibrary,
  type LocalLibrarySong,
  type LocalSongLink,
  type RetentionRow,
  type SyncState,
} from './types';

export class MemoryLocalLibrary implements LocalLibrary {
  private songs = new Map<string, LocalLibrarySong>();
  private favorites = new Set<string>();
  private links: LocalSongLink[] = [];
  private sync = new Map<string, SyncState>();
  private retention = new Map<string, RetentionRow>();

  async listSongs(): Promise<LocalLibrarySong[]> {
    return [...this.songs.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  async getSong(id: string): Promise<LocalLibrarySong | null> {
    return this.songs.get(id) ?? null;
  }

  async saveSong(song: LocalLibrarySong): Promise<void> {
    this.songs.set(song.id, { ...song });
  }

  async deleteSong(id: string): Promise<void> {
    this.songs.delete(id);
    this.favorites.delete(id);
    this.sync.delete(id);
    this.retention.delete(id);
  }

  async listFavorites(): Promise<string[]> {
    return [...this.favorites];
  }

  async setFavorite(songId: string, on: boolean): Promise<void> {
    if (on) this.favorites.add(songId);
    else this.favorites.delete(songId);
  }

  async listLinks(): Promise<LocalSongLink[]> {
    return [...this.links];
  }

  async saveLink(link: LocalSongLink): Promise<void> {
    this.links = this.links.filter(
      (l) => !(l.song_id === link.song_id && l.related_song_id === link.related_song_id),
    );
    this.links.push({ ...link });
  }

  async getSyncState(songId: string): Promise<SyncState | null> {
    return this.sync.get(songId) ?? null;
  }

  async setSyncState(state: SyncState): Promise<void> {
    this.sync.set(state.song_id, { ...state });
  }

  async listRetention(): Promise<RetentionRow[]> {
    return [...this.retention.values()];
  }

  async setRetention(row: RetentionRow): Promise<void> {
    this.retention.set(row.song_id, { ...row });
  }

  async deleteRetention(songId: string): Promise<void> {
    this.retention.delete(songId);
  }

  async importEmbedded(song: EmbeddedSongLike, language: Lang): Promise<LocalLibrarySong> {
    const row = embeddedToLibrarySong(song, language);
    await this.saveSong(row);
    return row;
  }
}

/** Shared by adapters: a by-value blob becomes a library row (an IMPORT). */
export function embeddedToLibrarySong(song: EmbeddedSongLike, language: Lang): LocalLibrarySong {
  const now = new Date().toISOString();
  return {
    id: `import-${song.id}`,
    // A by-value blob that carries a library identity stays linked to it.
    global_song_id: song.id,
    link_state: 'linked',
    title: song.title,
    author: song.author ?? null,
    language,
    chordpro: embeddedToChordpro(song),
    analysis_key: song.defaultKey,
    verified: false,
    origin: 'imported',
    created_at: now,
    updated_at: now,
  };
}
