# @laudasist/shared

Shared utilities, types, and domain logic for the Laudasist application.

## Core Domain: Chord System

Laudasist uses the **Nashville Number System** as its internal representation for chords. This allows for instant, computation-free transposition to any key.

### Architecture

1.  **Input**: User enters chords in **Any** format (Letter, Roman, Nashville).
2.  **Storage**: Chords are converted and stored as `NashvilleChord` objects (Degree + Quality).
3.  **Display**: Chords are rendered back to the user's preferred format (Letter, Roman) in the target Key.

### Key Modules

#### `chords/nashville.ts`
The core module for handling Nashville Numbers.
- `parseAnyChord(chord, key)`: Only entry point needed. Detects format and converts to Nashville.
- `formatChord(chord, key, style)`: Renders a Nashville chord to string (e.g., "C", "I", "1").
- `embedChordsInLine(text, chords)`: Reconstructs a lyric line with embedded chords.
- `extractChordsFromLine(line)`: Parses a lyric line with `[brackets]` into text + chord objects.

#### `chords/converters.ts`
Helpers for specific notation conversions.
- `detectNotation(str)`: Identifies input type.
- `romanToNashville(str)`: Converts "V/vi" -> `5/6`.

#### `parsers/song-parser.ts`
Markdown parsing logic for "Quick Add".
- `parseSongFromMarkdown(text)`: Converts a markdown string into a structured `Song` object.

## Types

Global types are defined in `types/index.ts` and shared across frontend and backend.
- `Song`: The main entity.
- `SongPart`: Sections of a song (Verse, Chorus).
- `Key`: Valid musical keys.

## Testing

Run unit tests via `npm test` in this directory.
Tests cover:
- Chord detection and conversion
- Markdown parsing
- Key math (semitones, etc.)
