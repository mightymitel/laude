# Laudasist - Technical Specification

> **Your Worship Assistant** — An app to help churches and worship leaders manage worship services

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React (Vite), TanStack Router, TanStack Query, TypeScript, CSS Modules |
| **Backend** | Node.js, Express, Socket.io |
| **Data Fetching** | TanStack Query |
| **Database** | MongoDB |
| **Auth & Storage** | Firebase Authentication, Firebase Storage |
| **Deployment** | Firebase Hosting |
| **Bible Data** | Self-hosted database (NIV, KJV, NTR, VDCC) |

---

## Data Models

### Song

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

### Nashville Number System (Chord Storage)

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

### User

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

### Church

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

### Service

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

### Worship Session (Local Mode)

A **Worship Session** is a transient, client-side-only experience for quick worship leading. Unlike full Services, Worship Sessions do not persist to the database.

**Features:**
- **Instant Start**: Dashboard "Start Playing" button → `/session`
- **Song Search**: Live search from library
- **Local State**: Current song, part, key, chord style stored in React state
- **Unified View**: All song parts visible, active part highlighted
- **Chord Display Modes**:

| Mode | Description |
|------|-------------|
| `above` | Chords float above lyrics at position |
| `inline` | Chords appear in `[brackets]` within text |
| `compact` | Lyrics on left, all chords grouped at row end |

**State (Local Only):**
```typescript
currentSongId: string | null
currentPartIndex: number
displayKey: Key
chordStyle: 'letters' | 'nashville' | 'roman' | 'caseSensitive'
chordDisplay: 'above' | 'inline' | 'compact'
showChords: boolean
```

---

### Viewport

```typescript
interface ViewportConfig {
  id: string;
  name: string;
  type: "audience" | "stage" | "instrument" | "phone" | "subtitles" | "custom";
  
  // Access
  visibility: "public" | "private"; // Public = guest access via link, Private = password or logged-in members
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
  // Future: more granular element positioning
}
```

---

### Bible

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

**Search**: Users can search for versions and translations of a given song via the `translationOf` and `clonedFrom` fields.

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

## Real-Time Architecture

### Socket.io Events

**Service Room**: `service:{serviceId}`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join-viewport` | Client→Server | `{ viewportId }` | Join viewport broadcast room |
| `slide-change` | Server→Client | `{ slideData, partId }` | Current slide updated |
| `viewport-update` | Server→Client | `{ theme, layout }` | Viewport settings changed |
| `service-status` | Server→Client | `{ status }` | Service went live/ended |

**Scaling Target** (Phase 1):
- ~1,000 concurrent live services
- ~5 viewports per service average
- ~5 viewers per viewport average
- Only one server instance with MongoDB

---

## Core Features

### Fast Service (Local View)

Simplified presenter experience:
- 2-column layout: Song Search | Live View
- No preview step — song goes live immediately
- Local view only (no viewports initially)
- Chord display toggle, transpose, chord style options

### Full Live Service

Complete presenter dashboard:
- **Column 1**: Playlist (songs + bible), quick search across libraries
- **Column 2**: Preview — edit content before committing
- **Column 3**: Live — currently broadcasting content
- **Column 4**: Viewport previews — monitor all active viewports

**Presenter Actions:**
- Select song/verse → appears in Preview
- Commit Preview → goes Live → broadcasts to all viewports
- Navigate slides via arrows or click
- Edit slides on-the-fly in Preview
- Add new songs during service
- Multiple concurrent presenters supported

---

## MVP Phases

### Phase 1: Foundation
- Firebase Authentication (Google, Facebook, Apple, Email)
- User Dashboard (recently played, saved playlists, library, favorites)
- Personal Song Library (CRUD)
- Song creation with Nashville Number chord notation
- Song search (name, author, tags, lyrics)

### Phase 2: Fast Service
- User Fast Service (local view only)
- 2-column presenter UI
- Real-time chord transposition
- Chord display options (Nashville/Letters/Roman)

### Phase 3: Viewports & Community
- **Viewport Types** (accessed via `?type=` query param):
  - `audience` (default) - Full screen lyrics, optimized for church projection, fullscreen button
  - `stage` - Lyrics + chords above for musicians
  - `instrument` - Chords + lyrics + preview of next part for instrumentalists
  - `subtitles` - High-contrast large text for overlays
- **Session Key Preference** - Toggle "Use song's original key" vs "Keep current key" when changing songs
- Real-time viewport broadcasting via Socket.io
- Worship Session Sharing - Live Session starts a broadcast
- Guest user can view the broadcast using a link
- Guest user can create a Worship Session but cannot share/broadcast it

### Phase 3B: Guest User Features
- **Community Library** - Public read-only song library for guests
- **Landing Page** - "Continue as Guest" option + "Start Worshiping" button
- **Guest Session** - Local worship session using community library (no Go Live)
- **Favorites** - Guest users can save favorite songs to localStorage
- **Limitations** - Guests cannot: go live, create songs, access private libraries

### Phase 4: Church Features
- Church creation and dashboard
- Church services
- Church song library
- Church member subscriptions
- Church roles (owner, admin, staff)

### Phase 5: Full Live Service
- Complete Presenter Dashboard (4-column)
- Preview → Live workflow
- Multi-viewport broadcasting via Socket.io
- Viewport theming and layout
- Access links (view/edit) with QR codes
- Concurrent presenter support

### Phase 6: Bible Integration
- Self-hosted Bible database
- Translations: NIV, KJV, NTR (Romanian), VDCC (Romanian)
- Bible search
- Bible playlist in services
- Bible verses as slides

---

## File Structure (Planned)

```
laudasist/
├── apps/
│   ├── web/                    # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   └── package.json
│   └── api/                    # Express backend
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── models/
│       │   ├── socket/
│       │   └── middleware/
│       └── package.json
├── packages/
│   ├── shared/                 # Shared types, utils
│   └── ui/                     # Shared UI components (Storybook)
├── docs/
│   └── SPEC.md
└── package.json                # Monorepo root
```

---

## Open Questions for Future Phases

1. **Video viewport broadcasting** — OBS integration or custom video stream?
2. **Offline support** — PWA with local caching for song library?
3. **Mobile apps** — React Native or web-only?
4. **Monetization** — Free tier limits, church subscription pricing?
5. **Song licensing** — CCLI integration for copyright compliance?
