/**
 * The ONE session state shape (Session & Realtime Sync — Unified Spec).
 * Authoritative copy lives in the transport: the relay's memory when live,
 * the LocalTransport when solo (same object, no network — DEC-35). Firestore
 * is an optional durability mirror written by the relay — never a transport.
 */
import type { CompanionDirectives, PresenterKind, SessionCurrent } from '@laude/song-model';

/** By-value song content: the full data a viewer needs, embedded in session
 * state — no library fetch, works offline and for guests. */
export interface EmbeddedSong {
  id: string;
  title: string;
  author?: string;
  defaultKey: string;
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

// ---------------------------------------------------------------------------
// Roster: role × type, orthogonal (DEC-36)
// ---------------------------------------------------------------------------

/** What you may WRITE — derived from which link you used (owner = the authed
 * creator's connection; there is no owner link). */
export type SessionRole = 'owner' | 'presenter' | 'viewer';

/** DJ behaviour is a consequence of who acts (DEC-43); shown read-only. */
export type DjMode = 'companion' | 'playback';

/** One connected participant. `kind` = what you ARE (self-declared). */
export interface SessionMember {
  id: string;
  name: string;
  kind: PresenterKind;
  role: SessionRole;
  joined_at: string; // ISO
  /** Present on kind 'dj' only — read-only mode reflection. */
  mode?: DjMode;
}

// ---------------------------------------------------------------------------
// Viewport directives (DEC-41): broadcast session-wide, keyed by target
// class; every viewport receives the whole set and self-selects. STATE, not
// events — late joiners inherit it.
// ---------------------------------------------------------------------------

export interface ViewportDirectives {
  blank: boolean;
  freeze: boolean;
  /** Shown instead of content while non-null (announcements etc.). */
  message: string | null;
}

export const DEFAULT_VIEWPORT_DIRECTIVES: ViewportDirectives = {
  blank: false,
  freeze: false,
  message: null,
};

/** Directive target classes ship with the preset registry; the type is open
 * (string) so authored templates can declare new classes later. */
export type DirectiveMap = Record<string, ViewportDirectives>;

export interface SessionState {
  id: string;
  ownerId: string;
  /** Viewer link credential ('' while local/solo — no links exist). */
  accessCode: string;
  /** Presenter link credential — only present in presenter/owner payloads. */
  presenterCode?: string;
  status: 'active' | 'ended';
  current: SessionCurrent;
  currentSong: EmbeddedSong | null;
  sessionPlaylist: SessionPlaylistItem[];
  chordStyle: string;
  companion: CompanionDirectives;
  /** Broadcast viewport directives keyed by declared class. */
  directives: DirectiveMap;
  /** Live roster (transient — presence only while connected; empty solo). */
  presenters: SessionMember[];
  /** DJ capability manifest (transient — from the connected dj presenter). */
  dj_manifest: DjManifestEntry[];
  /** Member id of the last state writer — mode/demotion logic keys off this. */
  updated_by: string;
  updated_at: string; // ISO
  created_at: string; // ISO
}

/** What a writer may change in one state:set (all fields optional). */
export interface SessionPatch {
  current?: Partial<SessionCurrent>;
  currentSong?: EmbeddedSong | null;
  sessionPlaylist?: SessionPlaylistItem[];
  chordStyle?: string;
  companion?: Partial<CompanionDirectives>;
  /** Per-class partial merges; a class first referenced here is created. */
  directives?: Record<string, Partial<ViewportDirectives>>;
}

/**
 * Session socket protocol version (WP-99). LauDJ and LaudStudio are
 * INSTALLED desktop apps updated on the user's schedule; Laudasist is a web
 * app updated on deploy — the monorepo hides that asymmetry until it fails
 * on a Sunday morning. The join handshake carries this number; the relay
 * refuses incompatible clients with a message the user can act on. Bump it
 * on ANY breaking change to the events or payload shapes below.
 */
export const SESSION_PROTOCOL_VERSION = 1;

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
  djMode: 'dj:mode',
  end: 'session:end',
} as const;

/** state:sync payload — the applied patch plus writer attribution. */
export interface StateSync {
  patch: SessionPatch;
  updated_by: string;
  updated_at: string;
}

/** session:snapshot payload — full state plus what YOUR connection resolved to. */
export interface SnapshotPayload {
  state: SessionState;
  role: SessionRole;
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

/** The durable slice a local session pushes to the relay when going live. */
export interface InitialSessionState {
  current: SessionCurrent;
  currentSong: EmbeddedSong | null;
  sessionPlaylist: SessionPlaylistItem[];
  chordStyle: string;
  companion: CompanionDirectives;
  directives: DirectiveMap;
}

export function durableSlice(state: SessionState): InitialSessionState {
  return {
    current: state.current,
    currentSong: state.currentSong,
    sessionPlaylist: state.sessionPlaylist,
    chordStyle: state.chordStyle,
    companion: state.companion,
    directives: state.directives,
  };
}

/**
 * Apply one writer patch to a state — THE merge semantics, shared by the
 * relay's authoritative store and the LocalTransport so solo and live behave
 * identically.
 */
export function applySessionPatch(
  state: SessionState,
  patch: SessionPatch,
  writerId: string,
  updatedAt = new Date().toISOString(),
): SessionState {
  let directives = state.directives;
  if (patch.directives !== undefined) {
    directives = { ...state.directives };
    for (const [cls, partial] of Object.entries(patch.directives)) {
      directives[cls] = { ...DEFAULT_VIEWPORT_DIRECTIVES, ...directives[cls], ...partial };
    }
  }
  return {
    ...state,
    ...(patch.current !== undefined ? { current: { ...state.current, ...patch.current } } : {}),
    ...(patch.currentSong !== undefined ? { currentSong: patch.currentSong } : {}),
    ...(patch.sessionPlaylist !== undefined ? { sessionPlaylist: patch.sessionPlaylist } : {}),
    ...(patch.chordStyle !== undefined ? { chordStyle: patch.chordStyle } : {}),
    ...(patch.companion !== undefined ? { companion: { ...state.companion, ...patch.companion } } : {}),
    directives,
    updated_by: writerId,
    updated_at: updatedAt,
  };
}
