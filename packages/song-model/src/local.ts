/**
 * Personal-domain contract: what LaudStudio's local-first store serves to
 * LauDJ over the local HTTP service. Mirrors the two-domain split — these
 * shapes never live in Firebase (Local Schema spec, WP-102).
 *
 * Chart domains (DEC-58): the CHART (degrees, work-level) lives on the local
 * SONG; chord EVENTS (time-domain, absolute pitch) and LRC live on the
 * PERFORMANCE. `preferred_performance_id` picks AUDIO only, never the chart.
 */
import type { ChordEvent, Lang, LrcLine, PerformanceId, SongId, StemName, WorkPartRef } from './index';

/**
 * Per-section slice of the one-way section → work-part mapping as it crosses
 * the wire: an ACCEPTED mapping exposes the part ref; everything else
 * (unaligned / proposal held below threshold / deliberately instrumental) is
 * null — identical on the wire, distinct in the editor (DEC-62/63). A null
 * part is announced to the session as INSTRUMENTAL, never as a stale or
 * guessed part.
 */
export interface LocalSectionWire {
  id: string;
  label: string;
  /** 1-based occurrence among sections sharing this label. */
  ordinal: number;
  start_s: number;
  end_s: number;
  start_bar: number;
  end_bar: number;
  /** Accepted work-part mapping, or null (→ announce instrumental). */
  part: WorkPartRef | null;
}

/** One playable song as advertised by LaudStudio's catalog endpoint. */
export interface LocalCatalogSong {
  /** Global song ID when linked; the local song id otherwise. */
  song_id: SongId;
  local_song_id: string;
  /** True when the local song is linked to (or was minted as) a global song. */
  linked: boolean;
  title: string;
  language: Lang;
  /** The playable key: the preferred performance's detected key, falling
   * back to the song's analysis key when no performance exists. */
  key: string;
  bpm: number;
  duration_s: number;
  /** Preferred performance (null when a song has no extracted rendition yet). */
  performance_id: PerformanceId | null;
  sections: LocalSectionWire[];
  /** Stems with real audio on disk (empty → simulated playback). */
  stems: StemName[];
  /** Pre-rendered key variants incl. 0 (the original), e.g. [-2,-1,0,1,2]. */
  key_variants: number[];
  verified: boolean;
}

/** Work-level song detail: the chart and its keys (by-value session payload,
 * offline read cache — DEC-61). */
export interface LocalSongDetail {
  local_song_id: string;
  global_song_id: SongId | null;
  link_state: 'local' | 'linked';
  title: string;
  language: Lang;
  /** The active chart — Nashville degrees + head {key:} reference. */
  chordpro: string;
  chart_source: 'derived' | 'snapshot';
  /** The key the degrees were computed against (the re-key knob). */
  analysis_key: string;
  verified: boolean;
}

/** Full per-performance detail: timing + harmony evidence + audio inventory. */
export interface LocalPerformanceDetail {
  performance_id: PerformanceId;
  local_song_id: string;
  /** This recording's key — drives stem key-variant rendering (DEC-60). */
  detected_key: string;
  bpm: number;
  beats: number[];
  /** Indices into `beats` that are downbeats. */
  downbeats: number[];
  /** Time-domain chord changes, absolute pitch — re-derivation evidence. */
  chord_events: ChordEvent[];
  sections: LocalSectionWire[];
  lrc: LrcLine[];
  audio: { stems: StemName[]; key_variants: number[]; mixdown: boolean };
}

/** Endpoint paths on the LaudStudio local service (default http://127.0.0.1:3002). */
export const localApi = {
  catalog: () => '/catalog',
  song: (localSongId: string) => `/songs/${localSongId}`,
  performance: (performanceId: PerformanceId) => `/performances/${performanceId}`,
  stem: (performanceId: PerformanceId, stem: StemName) => `/audio/${performanceId}/stem/${stem}`,
  keyVariant: (performanceId: PerformanceId, stem: StemName, semitones: number) =>
    `/audio/${performanceId}/variant/${stem}/${semitones}`,
  mixdown: (performanceId: PerformanceId) => `/audio/${performanceId}/mixdown`,
};
