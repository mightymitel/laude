/**
 * The ONE session state shape (Session & Realtime Sync — Unified Spec).
 * Authoritative copy lives in the relay's memory; clients receive snapshots
 * (session:snapshot / REST) and deltas (state:sync). Firestore is an optional
 * durability mirror written by the relay — never a client transport.
 */
import type { CompanionDirectives, Presenter, SessionCurrent } from '@laude/song-model';

/** By-value song content: the full data a viewer needs, embedded in session
 * state — no library fetch, works offline and for guests. */
export interface EmbeddedSong {
  id: string;
  title: string;
  author?: string;
  originalKey: string;
  parts: EmbeddedSongPart[];
}

/** Structurally compatible with Laudasist's SongPart. */
export interface EmbeddedSongPart {
  id: string;
  type: string;
  index: number;
  lines: { text: string }[];
}

export interface SessionPlaylistItem {
  id: string;
  songId: string;
  key?: string;
  arrangement?: string;
  /** By-value payload for presenter/viewer access (no library fetch). */
  song?: EmbeddedSong;
  /** Auto-added when the owner selects a song not in the playlist. */
  temporary?: boolean;
}

/** One song the DJ advertises on join (transient; clears on disconnect). */
export interface DjManifestEntry {
  /** Global song id when linked; null for DJ-local songs. */
  song_id: string | null;
  local_song_id: string;
  title: string;
  key: string;
  bpm: number;
  has_stems: boolean;
}

export interface SessionState {
  id: string;
  ownerId: string;
  /** Viewer link credential. */
  accessCode: string;
  /** Presenter link credential — only present in presenter/owner payloads. */
  presenterCode?: string;
  status: 'active' | 'ended';
  current: SessionCurrent;
  currentSong: EmbeddedSong | null;
  sessionPlaylist: SessionPlaylistItem[];
  chordStyle: string;
  companion: CompanionDirectives;
  /** Live roster (transient — presence only while connected). */
  presenters: Presenter[];
  /** DJ capability manifest (transient — from the connected dj presenter). */
  dj_manifest: DjManifestEntry[];
  /** Presenter id of the last state writer — the yield rule keys off this. */
  updated_by: string;
  updated_at: string; // ISO
  created_at: string; // ISO
}

/** What a presenter may change in one state:set (all fields optional). */
export interface SessionPatch {
  current?: Partial<SessionCurrent>;
  currentSong?: EmbeddedSong | null;
  sessionPlaylist?: SessionPlaylistItem[];
  chordStyle?: string;
  companion?: Partial<CompanionDirectives>;
}

/** Socket event names — single source for client + relay. */
export const EVENTS = {
  join: 'session:join',
  leave: 'session:leave',
  snapshot: 'session:snapshot',
  stateSet: 'state:set',
  stateSync: 'state:sync',
  rosterChanged: 'roster:changed',
  djManifest: 'dj:manifest',
  djManifestChanged: 'dj:manifest:changed',
  end: 'session:end',
} as const;

/** state:sync payload — the applied patch plus writer attribution. */
export interface StateSync {
  patch: SessionPatch;
  updated_by: string;
  updated_at: string;
}

export const DEFAULT_CURRENT: SessionCurrent = {
  song_id: null,
  section_index: 0,
  key: null,
  tempo_pct: 100,
  blank: false,
};

export const DEFAULT_COMPANION: CompanionDirectives = {
  pads_on: false,
  pad_style: 'warm',
  pad_volume: 0.5,
  interlude: false,
};
