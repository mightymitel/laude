// ==========================================
// KEYS & MUSIC THEORY
// ==========================================

export type Key =
    | 'C'
    | 'C#'
    | 'Db'
    | 'D'
    | 'D#'
    | 'Eb'
    | 'E'
    | 'F'
    | 'F#'
    | 'Gb'
    | 'G'
    | 'G#'
    | 'Ab'
    | 'A'
    | 'A#'
    | 'Bb'
    | 'B';

export type ChordQuality =
    | ''
    | 'm'
    | 'dim'
    | 'aug'
    | 'sus2'
    | 'sus4'
    | 'maj7'
    | '7'
    | 'm7'
    | 'dim7'
    | 'add9'
    | '9'
    | '11'
    | '13';

export type ChordStyle = 'nashville' | 'letters' | 'roman' | 'caseSensitive';

export type PadStyle = 'foundations';

// ==========================================
// SONG TYPES
// ==========================================

export type PartType = 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'outro' | 'intro' | 'tag';

export interface SongPart {
    id: string;
    type: PartType;
    index: number;
    lines: SongLine[];
}

export interface SongLine {
    text: string; // e.g., "  [1]Amazing [4]grace how [5]sweet the sound"
}

export interface Arrangement {
    id: string;
    name: string;
    order: string[]; // e.g., ["V1", "V2", "C1", "C1", "V3"]
    isDefault: boolean;
}

export type LibraryType = 'official' | 'community' | 'church' | 'user';
export type Visibility = 'public' | 'private';

export interface Song {
    id: string;
    title: string;
    author?: string;
    defaultKey: Key;
    defaultArrangement: string[];
    arrangements: Arrangement[];
    parts: SongPart[];
    tags: string[];

    // Content language (WP-173/DEC-151): separate from UI locale, optional
    // on legacy docs — consumers must fail open when absent.
    language?: 'ro' | 'en';

    // Library ownership
    libraryType: LibraryType;
    ownerId: string;
    visibility: Visibility;

    // Relationships
    translationOf?: string;
    clonedFrom?: string;
    relatedSongs?: string[];

    // Metadata
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
}

// ==========================================
// USER TYPES
// ==========================================

export type AuthProvider = 'google' | 'facebook' | 'apple' | 'email';

export type RoleType =
    | 'user'
    | 'church_admin'
    | 'church_owner'
    | 'church_staff'
    | 'official_admin'
    | 'community_moderator';

export interface UserRole {
    role: RoleType;
    churchId?: string;
}

export type ChurchMemberRole = 'member' | 'staff' | 'admin' | 'owner';

export interface ChurchSubscription {
    churchId: string;
    subscribedAt: Date;
    role: ChurchMemberRole;
}

export interface User {
    id: string;
    email: string;
    displayName: string;
    photoURL?: string | null;
    authProvider: AuthProvider;
    roles: UserRole[];
    churchSubscriptions: ChurchSubscription[];
    favoriteKey?: Key | null;
    defaultChordStyle: ChordStyle;
    favoriteSongs: string[];
    createdAt: Date;
    lastLoginAt: Date;
}

// ==========================================
// CHURCH TYPES
// ==========================================

export interface Church {
    id: string;
    name: string;
    description?: string;
    logoURL?: string;
    ownerId: string;
    createdAt: Date;
    defaultViewports: ViewportConfig[];
    defaultTheme: Theme;
}

// ==========================================
// SERVICE TYPES
// ==========================================

export type ServiceStatus = 'edit' | 'live' | 'archived';
export type OwnerType = 'user' | 'church';

export interface ServicePlaylistItem {
    id: string;
    songId: string;
    key: Key;
    arrangementId?: string;
    comments?: string;
    order: number;
}

export interface BibleReference {
    translationId: string;
    book: string;
    chapter: number;
    startVerse: number;
    endVerse?: number;
}

export type AccessLinkType = 'view' | 'edit';

export interface AccessLink {
    id: string;
    token: string;
    type: AccessLinkType;
    expiresAt?: Date;
    isRevoked: boolean;
    createdAt: Date;
}

export interface ServiceViewport {
    id: string;
    viewportId: string;
    config: ViewportConfig;
}

export interface Service {
    id: string;
    title: string;
    date: Date;
    theme?: string;
    status: ServiceStatus;
    ownerId: string;
    ownerType: OwnerType;
    playlist: ServicePlaylistItem[];
    biblePlaylist: BibleReference[];
    viewports: ServiceViewport[];
    accessLinks: AccessLink[];

    // Fast Service state
    currentSongId?: string;
    currentPartIndex?: number;
    currentKey?: Key;

    createdAt: Date;
    updatedAt: Date;
}

// ==========================================
// VIEWPORT TYPES
// ==========================================

export type ViewportType = 'audience' | 'stage' | 'instrument' | 'phone' | 'subtitles' | 'custom';
export type ViewportVisibility = 'public' | 'private';

export interface Theme {
    fontFamily: string;
    fontSize: number;
    textColor: string;
    backgroundColor: string;
    backgroundImage?: string;
    backgroundVideo?: string;
}

export type TextPosition = 'center' | 'bottom' | 'top';
export type TextAlign = 'center' | 'left' | 'right';

export interface ViewportLayout {
    textPosition: TextPosition;
    textAlign: TextAlign;
    padding: number;
}

export interface ViewportConfig {
    id: string;
    name: string;
    type: ViewportType;
    visibility: ViewportVisibility;
    password?: string;
    theme: Theme;
    layout: ViewportLayout;
    showChords: boolean;
    chordStyle: ChordStyle;
    showBackground: boolean;
    isUserDefined: boolean;
}

// ==========================================
// BIBLE TYPES
// ==========================================

export interface BibleTranslation {
    id: string;
    abbreviation: string;
    name: string;
    language: string;
}

export interface BibleVerse {
    id: string;
    translationId: string;
    book: string;
    chapter: number;
    verse: number;
    text: string;
}

// ==========================================
// API TYPES
// ==========================================

export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

export interface ApiError {
    message: string;
    code: string;
    statusCode: number;
}
