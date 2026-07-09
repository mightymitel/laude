/**
 * @laude/song-model — the data contract shared by LaudStudio, Laudasist and LauDJ,
 * across BOTH domains of the two-domain split (song ID = the join key):
 *  - GLOBAL (Firebase/Laudasist): songs, lyrics, links, setlists — see COLLECTIONS.
 *  - PERSONAL (LaudStudio local store): services, segments, performances and all
 *    time-annotations — the types live here, the data never touches Firestore
 *    (wire format in ./local).
 * Mirrors "Firebase Data Model & Contract" + "Cross-App Integration" (Notion).
 *
 * Rules encoded here:
 *  - auto-extracted content is written `verified: false` (UNVERIFIED); apps default to verified-only.
 *  - timing attaches to a *performance* (a recorded rendition), not the song.
 *  - content is language-separated; RO/EN songs connect only via a `song_links` translation relation.
 */

export type Lang = 'ro' | 'en';

export type SongId = string;
export type PerformanceId = string;
export type ServiceId = string;
export type SessionId = string;

// ---------------------------------------------------------------------------
// Songs & lyrics
// ---------------------------------------------------------------------------

export interface Song {
  id: SongId;
  canonical_title: string;
  /** Original key as written, e.g. "G", "F#m" (canonical English notation). */
  original_key: string;
  default_bpm: number;
  language: Lang;
  ccli_number?: string;
  tags: string[];
  /** False while auto-extracted and not yet human-confirmed. */
  verified: boolean;
  created_at: string; // ISO
}

export interface SongLyrics {
  song_id: SongId;
  lang: Lang;
  /** Canonical ChordPro source — the single source of truth for lyrics + inline chords. */
  chordpro: string;
  /** Karaoke timing (LRC-style, line-level with optional word-level). May be absent pre-Tier-2. */
  lrc?: LrcLine[];
  /** Denormalized from the song so security rules stay statically queryable. */
  visibility: 'public' | 'private';
  verified: boolean;
}

export interface LrcLine {
  time_s: number;
  text: string;
  words?: { time_s: number; text: string }[];
}

/** RO↔EN (or other) relations between language-separated songs. */
export interface SongLink {
  song_id: SongId;
  related_song_id: SongId;
  relation_type: 'translation' | 'medley' | 'alternate_arrangement';
}

// ---------------------------------------------------------------------------
// Services (source videos) & segments (Tier-1 output)
// PERSONAL DOMAIN: stored in LaudStudio's local store, never in Firestore.
// ---------------------------------------------------------------------------

export interface Service {
  id: ServiceId;
  date: string; // ISO date
  title: string;
  youtube_id: string;
}

export type SegmentType = 'song' | 'indemnuri' | 'announcement' | 'preaching';

export interface Segment {
  id: string;
  service_id: ServiceId;
  type: SegmentType;
  start_s: number;
  end_s: number;
  /** Set when a song segment has been matched/deduped to a library song. */
  song_id?: SongId;
}

// ---------------------------------------------------------------------------
// Performances & time-annotations (Tier-2 output; keyed by performance)
// PERSONAL DOMAIN: stored in LaudStudio's local store, never in Firestore.
// ---------------------------------------------------------------------------

export interface Performance {
  id: PerformanceId;
  song_id: SongId;
  service_id: ServiceId;
  youtube_id: string;
  start_s: number;
  end_s: number;
  key: string;
  bpm: number;
  verified: boolean;
  /** Stems rendered for this performance (empty until Tier-2 ran). */
  stems: StemName[];
  /** Pre-rendered key variants available, in semitones offset from `key`. */
  key_variants: number[];
}

export type StemName = 'vocals' | 'bass' | 'drums' | 'other';
export const ALL_STEMS: StemName[] = ['vocals', 'bass', 'drums', 'other'];

export interface SectionAnnotation {
  id: string;
  performance_id: PerformanceId;
  /** Verse / Chorus / Bridge / Intro / Outro / Tag — RO labels allowed too. */
  label: string;
  start_s: number;
  end_s: number;
  start_bar: number;
  end_bar: number;
}

export interface BeatGrid {
  performance_id: PerformanceId;
  bpm: number;
  /** Beat onsets in seconds. */
  beats: number[];
  /** Indices into `beats` that are downbeats. */
  downbeats: number[];
}

export interface ChordEvent {
  start_s: number;
  /** Canonical English chord symbol, e.g. "Em7", "D/F#". */
  chord: string;
}

export interface PerformanceChords {
  performance_id: PerformanceId;
  data: ChordEvent[];
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Setlists
// ---------------------------------------------------------------------------

export interface Setlist {
  id: string;
  title: string;
  date?: string;
  song_ids: SongId[];
}

export interface SetlistItem {
  id: string;
  setlist_id: string;
  song_id: SongId;
  order: number;
  /** Per-service key override. */
  key?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Live session (multi-presenter peer model) — base types only. The full
// session state + transport (stateful relay, socket/REST) live in
// @laude/session; the session is NOT a Firestore collection.
// ---------------------------------------------------------------------------

/** Self-declared presenter type — the roster shows who is connected and how. */
export type PresenterKind = 'human' | 'dj' | 'mic';

export interface Presenter {
  id: string;
  name: string;
  kind: PresenterKind;
  joined_at: string; // ISO
}

/** Companion directives (control tier 2) — session metadata any presenter sets; LauDJ reads via its session subscription. */
export interface CompanionDirectives {
  /** Leader's master switch: pads sound during song parts while true. */
  pads_on: boolean;
  pad_style: string;
  pad_volume: number; // 0..1
  /** True triggers an instrumental interlude (pads step the song's progression). */
  interlude: boolean;
}

export interface SessionCurrent {
  song_id: SongId | null;
  /** Index into the song's part/section order (arrangement). */
  section_index: number;
  /** Display/performance key override; null = the song's own key. */
  key: string | null;
  /** Live tempo as percentage of the performance BPM (100 = as recorded). */
  tempo_pct: number;
  blank: boolean;
}

// ---------------------------------------------------------------------------
// Firestore collection names (one place, no scattered strings)
// ---------------------------------------------------------------------------

// GLOBAL collections only — personal-domain data (performances, sections,
// beatgrid, chords, recorded services, segments) lives in the LaudStudio
// local store and has no Firestore collection.
export const COLLECTIONS = {
  songs: 'songs',
  song_lyrics: 'song_lyrics',
  song_links: 'song_links',
  setlists: 'setlists',
  setlist_items: 'setlist_items',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

// ---------------------------------------------------------------------------
// Cloud Storage layout — GLOBAL blobs only. Personal audio (stems, key
// variants, mixdowns) lives on LaudStudio's disk (see ./local + the
// LaudStudio local-schema spec); only shared pads stay in Cloud Storage.
// ---------------------------------------------------------------------------

export const storagePaths = {
  pad: (key: string, style: string, ext = 'ogg') => `pads/${key}/${style}.${ext}`,
};

export * from './local';
