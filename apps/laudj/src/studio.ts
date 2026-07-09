/**
 * LauDJ's window into LaudStudio's local-first store: the catalog + per-
 * performance detail over the local HTTP service, and audio file URLs.
 * LauDJ has NO cloud store of its own — the personal domain is local
 * (see "Cross-App Integration, Storage & Communication Flow").
 */
import {
  localApi,
  type LocalCatalogSong,
  type LocalPerformanceDetail,
  type LocalSongDetail,
  type StemName,
} from '@laude/song-model';

export const STUDIO_URL: string =
  typeof import.meta.env?.VITE_STUDIO_URL === 'string'
    ? import.meta.env.VITE_STUDIO_URL
    : 'http://127.0.0.1:3002';

let catalogCache: LocalCatalogSong[] | null = null;
const performanceCache = new Map<string, LocalPerformanceDetail>();

export async function fetchCatalog(): Promise<LocalCatalogSong[]> {
  if (catalogCache) return catalogCache;
  const res = await fetch(`${STUDIO_URL}${localApi.catalog()}`);
  if (!res.ok) throw new Error(`LaudStudio catalog: HTTP ${res.status}`);
  const data: unknown = await res.json();
  const songs =
    typeof data === 'object' && data !== null && Array.isArray((data as { songs?: unknown }).songs)
      ? ((data as { songs: LocalCatalogSong[] }).songs)
      : [];
  catalogCache = songs;
  return songs;
}

export async function fetchSongDetail(localSongId: string): Promise<LocalSongDetail | null> {
  const res = await fetch(`${STUDIO_URL}${localApi.song(localSongId)}`);
  if (!res.ok) return null;
  return (await res.json()) as LocalSongDetail;
}

export async function fetchPerformance(performanceId: string): Promise<LocalPerformanceDetail | null> {
  const cached = performanceCache.get(performanceId);
  if (cached) return cached;
  const res = await fetch(`${STUDIO_URL}${localApi.performance(performanceId)}`);
  if (!res.ok) return null;
  const detail = (await res.json()) as LocalPerformanceDetail;
  performanceCache.set(performanceId, detail);
  return detail;
}

/** Preferred performance id for a song, from the cached catalog. */
export async function performanceIdFor(songId: string): Promise<string | null> {
  const catalog = await fetchCatalog();
  const entry = catalog.find((s) => s.song_id === songId || s.local_song_id === songId);
  return entry?.performance_id ?? null;
}

export const audioUrl = {
  stem: (performanceId: string, stem: StemName) => `${STUDIO_URL}${localApi.stem(performanceId, stem)}`,
  keyVariant: (performanceId: string, stem: StemName, semitones: number) =>
    `${STUDIO_URL}${localApi.keyVariant(performanceId, stem, semitones)}`,
  mixdown: (performanceId: string) => `${STUDIO_URL}${localApi.mixdown(performanceId)}`,
};
