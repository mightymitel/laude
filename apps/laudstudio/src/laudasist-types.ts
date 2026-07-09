/**
 * Local mirror of the Laudasist shapes the seeder writes.
 *
 * Source of truth: laudasist/packages/shared/src/types/index.ts (Song parts /
 * arrangements / User) and laudasist/apps/api/src/models/{User,Playlist}.ts.
 * @laudasist/shared is not an npm-linked dependency of the outer workspace, so
 * the handful of fields the mock seeder needs are mirrored here verbatim —
 * keep in sync if the Laudasist contract changes.
 */

export type Key =
  | 'C' | 'C#' | 'Db' | 'D' | 'D#' | 'Eb' | 'E' | 'F' | 'F#' | 'Gb'
  | 'G' | 'G#' | 'Ab' | 'A' | 'A#' | 'Bb' | 'B';

export type ChordStyle = 'nashville' | 'letters' | 'roman' | 'caseSensitive';

export type PartType = 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'outro' | 'intro' | 'tag';

export interface SongLine {
  text: string; // e.g. "[1]Amazing [4]grace how [5]sweet the sound"
}

export interface SongPart {
  id: string;
  type: PartType;
  index: number;
  lines: SongLine[];
}

export interface Arrangement {
  id: string;
  name: string;
  order: string[];
  isDefault: boolean;
}

export type LibraryType = 'official' | 'community' | 'church' | 'user';
export type Visibility = 'public' | 'private';

/** Laudasist-specific fields merged into the platform `songs` document. */
export interface LaudasistSongFields {
  title: string;
  author?: string;
  originalKey: Key;
  defaultArrangement: string[];
  arrangements: Arrangement[];
  parts: SongPart[];
  tags: string[];
  libraryType: LibraryType;
  ownerId: string;
  visibility: Visibility;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type AuthProvider = 'google' | 'facebook' | 'apple' | 'email';

export interface UserRole {
  role:
    | 'user'
    | 'church_admin'
    | 'church_owner'
    | 'church_staff'
    | 'official_admin'
    | 'community_moderator';
  churchId?: string;
}

/** Firestore `users` doc shape (laudasist/apps/api/src/models/User.ts). */
export interface LaudasistUserDoc {
  firebaseUid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  authProvider: AuthProvider;
  roles: UserRole[];
  churchSubscriptions: unknown[];
  favoriteKey: Key | null;
  defaultChordStyle: ChordStyle;
  favoriteSongs: string[];
  createdAt: Date;
  lastLoginAt: Date;
}

/** Firestore `playlists` doc shape (laudasist/apps/api/src/models/Playlist.ts). */
export interface PlaylistItem {
  id: string;
  songId: string;
  key?: Key;
  arrangement?: string;
  order: number;
}

export interface PlaylistDoc {
  ownerId: string;
  name: string;
  description?: string;
  items: PlaylistItem[];
  // The Laudasist API serializes playlist dates as ISO strings.
  createdAt: string;
  updatedAt: string;
}
