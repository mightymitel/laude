# Data Models

## Song

```typescript
interface Song {
  id: string;
  title: string;
  author?: string;
  originalKey: Key; // e.g., "C", "G", "Am"
  defaultArrangement: string[]; // e.g., ["V1", "V2", "C1", "C1", "V3", "C1", "B1"]
  arrangements: Arrangement[];
  parts: SongPart[];
  tags: string[]; // e.g., ["worship", "christmas", "joy"]
  
  // Library ownership
  libraryType: "official" | "community" | "church" | "user";
  ownerId: string; // userId or churchId depending on libraryType
  visibility: "public" | "private"; // Only applicable for user/church libraries
  
  // Relationships
  translationOf?: string; // songId if this is a translation
  clonedFrom?: string; // songId if this was cloned (maintains attribution)
  relatedSongs?: string[]; // Songs that work well together
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

interface SongPart {
  id: string; // e.g., "V1", "C1", "B1"
  type: "verse" | "chorus" | "bridge" | "pre-chorus" | "outro" | "intro" | "tag";
  index: number; // Which verse/chorus number (1, 2, 3...)
  lines: SongLine[];
}

interface SongLine {
  text: string; // Lyrics with chord placeholders: "  [1]Amazing [4]grace how [5]sweet the sound"
  // Lines start with 2 spaces for chords that need positioning before lyrics
}

interface Arrangement {
  id: string;
  name: string;
  order: string[]; // e.g., ["V1", "V2", "C1", "C1", "V3", "C1", "B1", "B1", "C1"]
  isDefault: boolean;
}
```

---

## Nashville Number System (Chord Storage)

Chords are stored using Nashville Number System for easy transposition:

| Notation | Meaning | Example in Key of C |
|----------|---------|---------------------|
| `1` | I chord (major) | C |
| `4` | IV chord (major) | F |
| `5` | V chord (major) | G |
| `2` | ii chord (minor) | Dm |
| `3` | iii chord (minor) | Em |
| `6` | vi chord (minor) | Am |
| `7` | vii° chord (diminished) | B° |
| `b7` | ♭VII chord | B♭ |
| `#4` | #IV chord | F# |
| `5/7` | V/7 (slash chord) | G/B |
| `1maj7` | Imaj7 | Cmaj7 |
| `5dom7` or `57` | V7 (dominant) | G7 |
| `2sus4` | ii sus4 | Dsus4 |
| `3maj` | III major (non-diatonic) | E |

**Chord Positioning**: Chords are embedded in lyrics using square brackets before the syllable:
```
  [1]Amazing [4]grace how [5]sweet the sound
```

---

## User

```typescript
interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  authProvider: "google" | "facebook" | "apple" | "email";
  
  // Roles (can hold multiple)
  roles: UserRole[];
  
  // Subscriptions
  churchSubscriptions: ChurchSubscription[];
  
  // Preferences
  favoriteKey?: Key;
  defaultChordStyle: "nashville" | "letters" | "roman";
  
  createdAt: Date;
  lastLoginAt: Date;
}

interface UserRole {
  role: "user" | "church_admin" | "church_owner" | "church_staff" | "official_admin" | "community_moderator";
  churchId?: string; // Required for church-specific roles
}

interface ChurchSubscription {
  churchId: string;
  subscribedAt: Date;
  role: "member" | "staff" | "admin" | "owner";
}
```

---

## Church

```typescript
interface Church {
  id: string;
  name: string;
  description?: string;
  logoURL?: string;
  
  ownerId: string;
  createdAt: Date;
  
  // Settings
  defaultViewports: ViewportConfig[];
  defaultTheme: Theme;
}
```

---

## Service

```typescript
interface Service {
  id: string;
  title: string;
  date: Date;
  theme?: string;
  
  status: "edit" | "live" | "archived";
  
  // Ownership
  ownerId: string; // userId or churchId
  ownerType: "user" | "church";
  
  // Content
  playlist: ServicePlaylistItem[];
  biblePlaylist: BibleReference[];
  
  // Viewports
  viewports: ServiceViewport[];
  
  // Access control
  accessLinks: AccessLink[];
  
  createdAt: Date;
  updatedAt: Date;
}

interface ServicePlaylistItem {
  id: string;
  songId: string;
  key: Key; // Can override song's default key
  arrangement?: string; // Arrangement ID, or use song default
  comments?: string;
  order: number;
}

interface AccessLink {
  id: string;
  token: string;
  type: "view" | "edit";
  expiresAt?: Date;
  isRevoked: boolean;
  createdAt: Date;
}
```

---

## Viewport

```typescript
interface ViewportConfig {
  id: string;
  name: string;
  type: "audience" | "stage" | "instrument" | "phone" | "subtitles" | "custom";
  
  // Access
  visibility: "public" | "private";
  password?: string; // For private viewports with guest password access
  
  // Theming
  theme: Theme;
  
  // Layout
  layout: ViewportLayout;
  
  // Display options
  showChords: boolean;
  chordStyle: "nashville" | "letters" | "roman";
  showBackground: boolean;
  
  // User-defined mode
  isUserDefined: boolean; // If true, presenter sends data but viewer controls layout/theme
}

interface Theme {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundImage?: string;
  backgroundVideo?: string;
}

interface ViewportLayout {
  textPosition: "center" | "bottom" | "top";
  textAlign: "center" | "left" | "right";
  padding: number;
}
```

---

## Bible

```typescript
interface BibleTranslation {
  id: string;
  abbreviation: string; // "NIV", "KJV", "NTR", "VDCC"
  name: string;
  language: string;
}

interface BibleVerse {
  id: string;
  translationId: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface BibleReference {
  translationId: string;
  book: string;
  chapter: number;
  startVerse: number;
  endVerse?: number;
}
```

---

## User Roles & Permissions

| Role | Scope | Permissions |
|------|-------|-------------|
| **user** | Global | CRUD own songs, create services, subscribe to churches |
| **church_staff** | Church | View church services, access church library |
| **church_admin** | Church | Manage church library, create church services, manage staff |
| **church_owner** | Church | Full church control, assign admins, delete church |
| **community_moderator** | Global | Approve/reject community submissions |
| **official_admin** | Global | Manage official library, platform settings |

---

## Song Libraries Hierarchy

| Library | Owner | Who Can Add | Visibility |
|---------|-------|-------------|------------|
| **Official** | Platform | Official Admins | Public |
| **Community** | Platform | Users (via share) | Public |
| **Church** | Church | Church Admin/Staff | Public or Private |
| **User** | User | User | Public or Private |

**Song Relationships:**
- **Translations**: Flat structure with `translationOf` reference to original song
- **Clones**: Independent copy with `clonedFrom` reference for attribution
- **Related Songs**: Bidirectional links for songs that work well together
