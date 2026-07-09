/**
 * Personal-domain contract: what LaudStudio's local-first store serves to
 * LauDJ over the local HTTP service. Mirrors the two-domain split — these
 * shapes never live in Firebase (see "Cross-App Integration" / Architecture).
 *
 * ASSUMPTION (local-schema spec pending): the wire format below and the
 * endpoint paths in `localApi` are provisional and logged for the spec.
 */
import type { ChordEvent, Lang, LrcLine, PerformanceId, SongId, StemName } from './index';

/** One playable song as advertised by LaudStudio's catalog endpoint. */
export interface LocalCatalogSong {
  /** Global song ID when linked; the local song id otherwise. */
  song_id: SongId;
  local_song_id: string;
  /** True when the local song is linked to (or was minted as) a global song. */
  linked: boolean;
  title: string;
  language: Lang;
  key: string;
  bpm: number;
  duration_s: number;
  /** Preferred performance (null when a song has no extracted rendition yet). */
  performance_id: PerformanceId | null;
  sections: { label: string; start_s: number }[];
  /** Stems with real audio on disk (empty → simulated playback). */
  stems: StemName[];
  /** Pre-rendered key variants incl. 0 (the original), e.g. [-2,-1,0,1,2]. */
  key_variants: number[];
  verified: boolean;
}

/** Full per-performance detail: timing + harmony + audio inventory. */
export interface LocalPerformanceDetail {
  performance_id: PerformanceId;
  local_song_id: string;
  key: string;
  bpm: number;
  beats: number[];
  /** Indices into `beats` that are downbeats. */
  downbeats: number[];
  chords: ChordEvent[];
  sections: { label: string; start_s: number; end_s: number; start_bar: number; end_bar: number }[];
  lrc: LrcLine[];
  chordpro: string;
  audio: { stems: StemName[]; key_variants: number[]; mixdown: boolean };
}

/** Endpoint paths on the LaudStudio local service (default http://127.0.0.1:3002). */
export const localApi = {
  catalog: () => '/catalog',
  performance: (performanceId: PerformanceId) => `/performances/${performanceId}`,
  stem: (performanceId: PerformanceId, stem: StemName) => `/audio/${performanceId}/stem/${stem}`,
  keyVariant: (performanceId: PerformanceId, stem: StemName, semitones: number) =>
    `/audio/${performanceId}/variant/${stem}/${semitones}`,
  mixdown: (performanceId: PerformanceId) => `/audio/${performanceId}/mixdown`,
};
