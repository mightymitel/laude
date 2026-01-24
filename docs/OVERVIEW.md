# Laudasist - Project Overview

> **Your Worship Assistant** — An app to help churches and worship leaders manage worship services

---

## Core Functionality

### Song Database
- Search by name, author, tags, lyrics (across versions)
- Store different versions and translations with a favorite version
- Link songs that work well together
- Create playlists
- Store chords with favorite key for each song:
  - Chords stored as Nashville Numbers for easy transposition
  - Position chords using `[brackets]` before the syllable
  - Lines start with 2 spaces for chord positioning

### Song Libraries

| Library | Owner | Who Can Add | Visibility |
|---------|-------|-------------|------------|
| **Official** | Platform | Official Admins | Public |
| **Community** | Platform | Users (via share) | Public |
| **Church** | Church | Church Admin/Staff | Public or Private |
| **User** | User | User | Public or Private |

**Song Operations:**
- Users can clone songs to their own library and modify them
- When moving a song between libraries, it's always cloned (separate copy with link to original)
- Each song has its own version number
- "Check for update" option to sync with original library (if no local lyric/chord changes)

### Song Data Separation
- **Content**: Lyrics and chords
- **Metadata**: Title, author, copyright, etc.
- **Options**: Key, tempo, arrangements
- When cloning, user can choose whether to clone options

---

## Users & Roles

| Role | Scope | Description |
|------|-------|-------------|
| **user** | Global | Basic user capabilities |
| **church_staff** | Church | View church services, access library |
| **church_admin** | Church | Manage library, create services, manage staff |
| **church_owner** | Church | Full church control, assign admins |
| **community_moderator** | Global | Approve/reject community submissions |
| **official_admin** | Global | Manage official library, platform settings |

- Users can subscribe to multiple churches
- Users can hold multiple roles
- Church subscription is an association to load church libraries, services, and news

---

## Services

- Listed only to admins and church staff
- Accessible via temporary generated link/QR code (separate view/edit links)
- Links can be revoked if needed
- View links work for guests; edit links require logged-in user

### Service Modes
1. **Edit** — Preparation mode
2. **Live** — Broadcasting to viewports
3. **Archived** — Completed service

### Service Content
- Playlist (songs with key override and comments)
- Bible playlist for quick verse access
- Main theme
- Defined viewport types

---

## Viewports

A viewport is a broadcasted view of a service.

### Default Types
- **audience** — Full screen lyrics for projection
- **stage** — Lyrics + chords for musicians
- **instrument** — Chords + lyrics + next part preview
- **phone** — Mobile-optimized view
- **subtitles** — High-contrast large text for overlays

### Viewport Settings
- Theme: font, color, background (solid/image/video)
- Layout: element positions and sizes
- Option for user-defined viewport (presenter sends data, user controls layout/theme)

---

## Presenter Dashboard

Special viewport for the presenter during live services:

| Column | Content |
|--------|---------|
| 1 | Playlist, Bible playlist, Quick search (favorites → church → official → community) |
| 2 | Preview — Edit content before committing |
| 3 | Live — Currently broadcasting content |
| 4 | Viewport previews |

**Presenter Actions:**
- Make changes to content, add slides in preview columns
- Adjust viewport theme, layout, background
- Add new songs during service
- Multiple presenters can control simultaneously

---

## User Flow

1. Login with Google, Facebook, Apple, or Email
2. User dashboard with recently played, playlists, services, church news, library
3. Create services and manage personal song library
4. Share songs to community or propose to official/church library

---

## Live Service Flow

1. Service set to live after preparation
2. All viewports begin broadcasting
3. Links generated for access
4. Presenter selects song/verse → appears in Preview
5. Commit Preview → goes Live → broadcasts to all viewports
6. Content split into slides, navigate via arrows or click
7. Edit/add slides on-the-fly in Preview

---

## Fast Service Mode

Quick start for simple worship leading:
- Directly in live mode, no initial viewports
- 2-column layout: Song search | Live view
- No preview step — song goes live immediately
- Chord display toggle, transpose, chord style options

**Dashboard "Start Playing" button** → Opens Fast Service

---

## Design Decisions

1. **Complex Chords**: Stored as Nashville Numbers with modifiers (e.g., `1maj7`, `b2`, `5/7`)
2. **Both user and church libraries**: Default private, can be made public (options hidden when public)
3. **Video viewport**: Future feature — video output for OBS integration
4. **Bible Integration**: Starting with API.Bible (KJV, Romanian Cornilescu), later self-hosted

---

## MVP Phases

| Phase | Focus |
|-------|-------|
| 1 | Auth, User Dashboard, Personal Song Library |
| 2 | Fast Service (local view only) |
| 3 | Viewports, Official/Community libraries |
| 4 | Church dashboard, services, library, subscriptions |
| 5 | Full Live Service with multi-viewport broadcasting |
| 6 | Bible Integration, search, playlist |

*See [FEATURES.md](./FEATURES.md) for detailed phase breakdowns.*
