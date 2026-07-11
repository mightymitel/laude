/**
 * IndexedDB LocalLibrary adapter (browser). Plain IDB, no wrapper deps —
 * four object stores mirroring the contract: songs (by id), links (by
 * composite key), favorites (by song id), sync (by song id).
 */
import type { Lang } from '@laude/song-model';
import { embeddedToLibrarySong } from './memory';
import type {
  EmbeddedSongLike,
  LocalLibrary,
  LocalLibrarySong,
  LocalSongLink,
  RetentionRow,
  SyncState,
} from './types';

const DB_NAME = 'laude-local-library';
// v2 (WP-158): + retention store (pinned downloads / cached recents).
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('links')) db.createObjectStore('links', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sync')) db.createObjectStore('sync', { keyPath: 'song_id' });
      if (!db.objectStoreNames.contains('retention')) db.createObjectStore('retention', { keyPath: 'song_id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function requestAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

export class IndexedDbLocalLibrary implements LocalLibrary {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= openDb();
    return this.dbPromise;
  }

  private async store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.db();
    return db.transaction(name, mode).objectStore(name);
  }

  async listSongs(): Promise<LocalLibrarySong[]> {
    const songs = await requestAsPromise(
      (await this.store('songs', 'readonly')).getAll() as IDBRequest<LocalLibrarySong[]>,
    );
    return songs.sort((a, b) => a.title.localeCompare(b.title));
  }

  async getSong(id: string): Promise<LocalLibrarySong | null> {
    const song = await requestAsPromise(
      (await this.store('songs', 'readonly')).get(id) as IDBRequest<LocalLibrarySong | undefined>,
    );
    return song ?? null;
  }

  async saveSong(song: LocalLibrarySong): Promise<void> {
    await requestAsPromise((await this.store('songs', 'readwrite')).put(song));
  }

  async deleteSong(id: string): Promise<void> {
    await requestAsPromise((await this.store('songs', 'readwrite')).delete(id));
    await requestAsPromise((await this.store('favorites', 'readwrite')).delete(id));
    await requestAsPromise((await this.store('sync', 'readwrite')).delete(id));
    await requestAsPromise((await this.store('retention', 'readwrite')).delete(id));
  }

  async listFavorites(): Promise<string[]> {
    const rows = await requestAsPromise(
      (await this.store('favorites', 'readonly')).getAll() as IDBRequest<{ id: string }[]>,
    );
    return rows.map((r) => r.id);
  }

  async setFavorite(songId: string, on: boolean): Promise<void> {
    const store = await this.store('favorites', 'readwrite');
    if (on) await requestAsPromise(store.put({ id: songId }));
    else await requestAsPromise(store.delete(songId));
  }

  async listLinks(): Promise<LocalSongLink[]> {
    const rows = await requestAsPromise(
      (await this.store('links', 'readonly')).getAll() as IDBRequest<(LocalSongLink & { key: string })[]>,
    );
    return rows.map(({ key: _key, ...link }) => link);
  }

  async saveLink(link: LocalSongLink): Promise<void> {
    await requestAsPromise(
      (await this.store('links', 'readwrite')).put({
        ...link,
        key: `${link.song_id}→${link.related_song_id}`,
      }),
    );
  }

  async getSyncState(songId: string): Promise<SyncState | null> {
    const state = await requestAsPromise(
      (await this.store('sync', 'readonly')).get(songId) as IDBRequest<SyncState | undefined>,
    );
    return state ?? null;
  }

  async setSyncState(state: SyncState): Promise<void> {
    await requestAsPromise((await this.store('sync', 'readwrite')).put(state));
  }

  async listRetention(): Promise<RetentionRow[]> {
    return requestAsPromise(
      (await this.store('retention', 'readonly')).getAll() as IDBRequest<RetentionRow[]>,
    );
  }

  async setRetention(row: RetentionRow): Promise<void> {
    await requestAsPromise((await this.store('retention', 'readwrite')).put(row));
  }

  async deleteRetention(songId: string): Promise<void> {
    await requestAsPromise((await this.store('retention', 'readwrite')).delete(songId));
  }

  async importEmbedded(song: EmbeddedSongLike, language: Lang): Promise<LocalLibrarySong> {
    const row = embeddedToLibrarySong(song, language);
    await this.saveSong(row);
    return row;
  }
}
