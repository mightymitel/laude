
import { PartType, Key } from '../types/index.js';
import { parseAnyChord, ChordPosition } from '../chords/nashville.js';

export interface ParsedSongLine {
    text: string;
    chords: ChordPosition[];
}

export interface ParsedSongPart {
    type: PartType;
    index: number;
    lines: ParsedSongLine[];
}

export interface ParsedSong {
    title?: string;
    parts: ParsedSongPart[];
}

/**
 * Standard Part Headers map
 */
const PART_HEADERS: Record<string, PartType> = {
    'verse': 'verse',
    'chorus': 'chorus',
    'bridge': 'bridge',
    'pre-chorus': 'pre-chorus',
    'outro': 'outro',
    'intro': 'intro',
    'tag': 'tag'
};

/**
 * Parse a markdown-style song input
 * 
 * Format:
 * # Verse 1
 * [1] Line with [4] chords
 * 
 * # Chorus
 * [1] Another line
 */
/**
 * Parses a markdown-formatted song string into a structured ParsedSong object.
 * 
 * Format:
 * # Header (e.g., Verse 1, Chorus)
 * [Chord] Lyrics [Chord]
 * 
 * Rules:
 * - Lines starting with `#` are treated as part headers.
 * - Blank lines are ignored or separate parts if needed (implicit separation not currently enforced).
 * - Chords are detected within square brackets `[]` using `parseAnyChord`.
 * - Parts are auto-numbered if index is not explicitly provided (e.g., "Verse" -> Verse 1, "Verse" -> Verse 2).
 * 
 * @param text The raw markdown string
 * @param key The key to interpret chords in (default "C" if not provided, though logic currently requires it)
 * @returns ParsedSong object containing title (optional), author (optional), and parts
 */
export function parseSongFromMarkdown(text: string, key: Key): ParsedSong {
    const lines = text.split('\n');
    const parts: ParsedSongPart[] = [];

    let currentPart: ParsedSongPart | null = null;

    // Counters for default numbering
    const counters: Record<string, number> = {};

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines in between parts, but maybe keep them if inside a part?
        // Current spec says blank lines are ignored or separate stanzas.
        // Let's treat header as start of new part.

        if (trimmed.startsWith('#')) {
            // New Part
            const headerContent = trimmed.replace(/^#+\s*/, '').toLowerCase();

            // Try to detect part type and index
            let type: PartType = 'verse'; // Default
            let index = 1;

            // Check known types
            let foundType = false;
            for (const [key, val] of Object.entries(PART_HEADERS)) {
                if (headerContent.includes(key)) {
                    type = val;
                    foundType = true;
                    break;
                }
            }

            if (!foundType) {
                // If unknown header, maybe treat as valid part name or default to verse?
                // For now default to verse if unrecognized
            }

            // Extract number if present
            const numMatch = headerContent.match(/\d+/);
            if (numMatch) {
                index = parseInt(numMatch[0], 10);
            } else {
                // Auto-increment if not specified
                counters[type] = (counters[type] || 0) + 1;
                index = counters[type]!;
            }

            currentPart = {
                type,
                index,
                lines: []
            };
            parts.push(currentPart);
            continue;
        }

        if (!trimmed) {
            continue;
        }

        // It's a lyric line
        if (!currentPart) {
            // Content before first header -> Implicit Verse 1
            currentPart = {
                type: 'verse',
                index: 1,
                lines: []
            };
            parts.push(currentPart);
            counters['verse'] = 1;
        }

        // Extract chords
        // We use extractChordsFromLine from nashville.ts BUT we need to support flexible input
        // extractChordsFromLine uses parseNashville internally.
        // We need a version that uses parseAnyChord.

        // Let's implement a local extraction using parseAnyChord logic
        // Or better, update nashville.ts to export a flexible extractor, or pass a parser fn.
        // Since I can't easily change nashville.ts signature widely without breaking things,
        // let's follow the data flow: Text -> [brackets] -> parseAnyChord -> NashvilleChord

        const extracted = extractChordsWithFlexibleParser(line, key);
        currentPart.lines.push(extracted);
    }

    return { parts };
}

/**
 * Extract chords allowing mixed notation (converted to Nashville using Key)
 */
function extractChordsWithFlexibleParser(line: string, key: Key): ParsedSongLine {
    const chords: ChordPosition[] = [];
    let cleanText = '';
    let i = 0;
    let textIndex = 0;

    while (i < line.length) {
        if (line[i] === '[') {
            const closeIndex = line.indexOf(']', i);
            if (closeIndex !== -1) {
                const chordStr = line.substring(i + 1, closeIndex); // content inside brackets
                const chord = parseAnyChord(chordStr, key);

                if (chord) {
                    chords.push({ chord, index: textIndex });
                    i = closeIndex + 1;
                    continue;
                } else {
                    // Not a valid chord, treat as text? Or keep brackets?
                    // If we failed to parse, usually we keep it as text or ignore. 
                    // Let's keep it as text if it looks like lyrics in brackets
                }
            }
        }

        cleanText += line[i];
        textIndex++;
        i++;
    }

    return { text: cleanText, chords };
}
