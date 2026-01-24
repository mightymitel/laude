# Worship Session

> Local-only worship leading experience for quick, personal use.

## Overview

A **Worship Session** is a transient, client-side-only experience for quick worship leading. Unlike full Services, Worship Sessions do not persist to the database and are not broadcast to viewports.

**Entry Point**: Dashboard "Start Playing" button → `/session`

---

## Features

- **Instant Start**: No setup required, immediate song display
- **Song Search**: Live search from library
- **Local State**: All state stored in React, not persisted
- **Unified View**: All song parts visible, active part highlighted

---

## Chord Display Modes

| Mode | Description |
|------|-------------|
| `above` | Chords float above lyrics at position |
| `inline` | Chords appear in `[brackets]` within text |
| `compact` | Lyrics on left, all chords grouped at row end |

---

## State (Local Only)

```typescript
currentSongId: string | null
currentPartIndex: number
displayKey: Key
chordStyle: 'letters' | 'nashville' | 'roman' | 'caseSensitive'
chordDisplay: 'above' | 'inline' | 'compact'
showChords: boolean
```

---

## User Actions

1. Search and select a song
2. Song displays immediately (no preview step)
3. Navigate between parts
4. Transpose key, toggle chords, change chord style
5. Select next song

---

## Limitations

- No database persistence
- No viewport broadcasting
- No multi-user sync
- Guest users cannot Go Live from a session
