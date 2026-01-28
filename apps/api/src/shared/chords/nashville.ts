import type { Key, ChordQuality, ChordStyle } from '../types/index.js';
import {
    DEFAULT_QUALITIES,
    getMajorScaleNotes,
    getNoteIndex,
    getNoteAtIndex,
} from './keys.js';

/**
 * Represents a chord in Nashville Number System format
 */
export interface NashvilleChord {
    degree: number; // 1-7
    accidental?: 'b' | '#'; // flat or sharp modifier
    quality: ChordQuality;
    bass?: number; // For slash chords (e.g., 1/5 = C/G)
    bassAccidental?: 'b' | '#';
}

/**
 * Position of a chord within a line
 */
export interface ChordPosition {
    chord: NashvilleChord;
    index: number; // Character index in the text (after removing chord markers)
}

/**
 * Regex for parsing Nashville notation: [1], [b2], [5maj7], [1/5], etc.
 */
const NASHVILLE_REGEX = /^\[([b#]?)([1-7])([a-z0-9]*)(?:\/([b#]?)([1-7]))?\]$/i;

/**
 * Regex for parsing letter chords: C, Am, F#m7, Bb/D, etc.
 */
const LETTER_CHORD_REGEX = /^([A-G])([b#]?)([a-z0-9]*)(?:\/([A-G])([b#]?))?$/i;

import { detectNotation, romanToNashville } from './converters.js';

/**
 * Parse a Nashville notation string (e.g., "1", "b2", "5maj7", "1/5")
 */
export function parseNashville(input: string): NashvilleChord | null {
    const clean = input.startsWith('[') ? input : `[${input}]`;
    const match = clean.match(NASHVILLE_REGEX);

    if (!match) return null;

    const [, accidental, degreeStr, quality, bassAccidental, bassDegreeStr] = match;

    const degree = parseInt(degreeStr ?? '1', 10);
    if (degree < 1 || degree > 7) return null;

    return {
        degree,
        accidental: (accidental as 'b' | '#') || undefined,
        quality: (quality?.toLowerCase() as ChordQuality) || '',
        bass: bassDegreeStr ? parseInt(bassDegreeStr, 10) : undefined,
        bassAccidental: (bassAccidental as 'b' | '#') || undefined,
    };
}

/**
 * Parse any chord format (Nashville, Roman, Letter) into Nashville
 */
export function parseAnyChord(chord: string, key: Key): NashvilleChord | null {
    // Remove brackets if present
    const clean = chord.replace(/^\[|\]$/g, '');
    const notation = detectNotation(clean);

    switch (notation) {
        case 'nashville':
            return parseNashville(clean);
        case 'letter':
            // letterToNashville is in THIS file, not converters. 
            // Wait, letterToNashville is defined below. 
            // So I don't need to import letterToNashville from converters.
            // But I DO need internal call.
            return letterToNashville(clean, key);
        case 'roman':
            return romanToNashville(clean);
        default:
            return null;
    }
}



/**
 * Convert a letter chord (e.g., "Am", "F#m7") to Nashville given a key
 */
export function letterToNashville(chord: string, key: Key): NashvilleChord | null {
    const match = chord.match(LETTER_CHORD_REGEX);
    if (!match) return null;

    const [, rootLetter, rootAccidental, quality, bassLetter, bassAccidental] = match;

    const rootNote = `${rootLetter?.toUpperCase()}${rootAccidental || ''}`;

    // Find the degree of the root note
    const rootNoteIndex = getNoteIndex(rootNote);
    const keyIndex = getNoteIndex(key);
    const semitones = ((rootNoteIndex - keyIndex + 12) % 12);

    // Map semitones to scale degree
    const degreeMap: Record<number, { degree: number; accidental?: 'b' | '#' }> = {
        0: { degree: 1 },
        1: { degree: 2, accidental: 'b' },
        2: { degree: 2 },
        3: { degree: 3, accidental: 'b' },
        4: { degree: 3 },
        5: { degree: 4 },
        6: { degree: 4, accidental: '#' },
        7: { degree: 5 },
        8: { degree: 6, accidental: 'b' },
        9: { degree: 6 },
        10: { degree: 7, accidental: 'b' },
        11: { degree: 7 },
    };

    const degreeInfo = degreeMap[semitones];
    if (!degreeInfo) return null;

    // Determine quality from the input
    const chordQuality = (quality?.toLowerCase() || '') as ChordQuality;

    // Handle bass note for slash chords
    let bass: number | undefined;
    let bassAcc: 'b' | '#' | undefined;

    if (bassLetter) {
        const bassNote = `${bassLetter.toUpperCase()}${bassAccidental || ''}`;
        const bassNoteIndex = getNoteIndex(bassNote);
        const bassSemitones = ((bassNoteIndex - keyIndex + 12) % 12);
        const bassInfo = degreeMap[bassSemitones];
        if (bassInfo) {
            bass = bassInfo.degree;
            bassAcc = bassInfo.accidental;
        }
    }

    return {
        degree: degreeInfo.degree,
        accidental: degreeInfo.accidental,
        quality: chordQuality,
        bass,
        bassAccidental: bassAcc,
    };
}

/**
 * Convert a Nashville chord to a letter chord given a key
 */
export function nashvilleToLetter(chord: NashvilleChord, key: Key): string {
    const scaleNotes = getMajorScaleNotes(key);
    let rootNote = scaleNotes[chord.degree - 1] ?? 'C';

    // Apply accidental
    if (chord.accidental === 'b') {
        const idx = getNoteIndex(rootNote);
        rootNote = getNoteAtIndex(idx - 1);
    } else if (chord.accidental === '#') {
        const idx = getNoteIndex(rootNote);
        rootNote = getNoteAtIndex(idx + 1);
    }

    // Build the chord string
    let result = rootNote;

    // Add quality
    if (chord.quality) {
        result += chord.quality;
    } else {
        // Add default quality based on degree
        const defaultQuality = DEFAULT_QUALITIES[chord.degree] ?? '';
        result += defaultQuality;
    }

    // Add bass note for slash chords
    if (chord.bass) {
        let bassNote = scaleNotes[chord.bass - 1] ?? 'C';
        if (chord.bassAccidental === 'b') {
            const idx = getNoteIndex(bassNote);
            bassNote = getNoteAtIndex(idx - 1);
        } else if (chord.bassAccidental === '#') {
            const idx = getNoteIndex(bassNote);
            bassNote = getNoteAtIndex(idx + 1);
        }
        result += `/${bassNote}`;
    }

    return result;
}

/**
 * Format a Nashville chord for display in a specific style
 */
export function formatChord(chord: NashvilleChord, key: Key, style: ChordStyle): string {
    switch (style) {
        case 'nashville':
            return formatNashville(chord);
        case 'letters':
            return nashvilleToLetter(chord, key);
        case 'roman':
            return formatRoman(chord);
        case 'caseSensitive':
            return formatCaseSensitive(chord, key);
        default:
            return formatNashville(chord);
    }
}

/**
 * Format as Nashville notation string
 */
function formatNashville(chord: NashvilleChord): string {
    let result = chord.accidental || '';
    result += chord.degree;
    result += chord.quality || '';

    if (chord.bass) {
        result += '/';
        result += chord.bassAccidental || '';
        result += chord.bass;
    }

    return result;
}

/**
 * Format as Roman numeral notation
 */
function formatRoman(chord: NashvilleChord): string {
    const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    let roman = romans[chord.degree - 1] ?? 'I';

    // Lowercase for minor chords
    const isMinor =
        chord.quality === 'm' ||
        chord.quality === 'm7' ||
        (!chord.quality && DEFAULT_QUALITIES[chord.degree] === 'm');

    if (isMinor) {
        roman = roman.toLowerCase();
    }

    let result = chord.accidental || '';
    result += roman;
    result += chord.quality?.replace('m', '') || '';

    if (chord.bass) {
        const bassRoman = romans[chord.bass - 1] ?? 'I';
        result += '/';
        result += chord.bassAccidental || '';
        result += bassRoman.toLowerCase();
    }

    return result;
}

/**
 * Format as case-sensitive notation (uppercase = major, lowercase = minor)
 * Examples: C = C major, c = C minor, G7 = G dominant 7
 */
function formatCaseSensitive(chord: NashvilleChord, key: Key): string {
    const scaleNotes = getMajorScaleNotes(key);
    let rootNote = scaleNotes[chord.degree - 1] ?? 'C';

    // Apply accidental
    if (chord.accidental === 'b') {
        const idx = getNoteIndex(rootNote);
        rootNote = getNoteAtIndex(idx - 1);
    } else if (chord.accidental === '#') {
        const idx = getNoteIndex(rootNote);
        rootNote = getNoteAtIndex(idx + 1);
    }

    // Determine if minor
    const isMinor =
        chord.quality === 'm' ||
        chord.quality === 'm7' ||
        (!chord.quality && DEFAULT_QUALITIES[chord.degree] === 'm');

    // Format root: lowercase for minor, uppercase for major
    let result = isMinor ? rootNote.toLowerCase() : rootNote;

    // Add quality (remove 'm' since case already indicates minor)
    const displayQuality = chord.quality?.replace(/^m(?!aj)/, '') || '';
    result += displayQuality;

    // Add bass for slash chords
    if (chord.bass) {
        let bassNote = scaleNotes[chord.bass - 1] ?? 'C';
        if (chord.bassAccidental === 'b') {
            const idx = getNoteIndex(bassNote);
            bassNote = getNoteAtIndex(idx - 1);
        } else if (chord.bassAccidental === '#') {
            const idx = getNoteIndex(bassNote);
            bassNote = getNoteAtIndex(idx + 1);
        }
        result += `/${bassNote.toLowerCase()}`;
    }

    return result;
}

/**
 * Transpose a Nashville chord by a number of semitones
 * Note: Nashville chords are relative to key, so transposing the key keeps the same Nashville notation
 * This function is for when you want to change the actual chord (e.g., modulation)
 */
export function transposeChord(chord: NashvilleChord, _semitones: number): NashvilleChord {
    // Nashville chords are relative, so they don't change when transposing the key
    // This is here for future use if we need to handle modulations
    return { ...chord };
}

/**
 * Extract chords and clean text from a line with embedded chords
 * Input: "  [1]Amazing [4]grace how [5]sweet the sound"
 * Output: { text: "  Amazing grace how sweet the sound", chords: [...] }
 */
export function extractChordsFromLine(line: string): { text: string; chords: ChordPosition[] } {
    const chords: ChordPosition[] = [];
    let cleanText = '';
    let i = 0;
    let textIndex = 0;

    while (i < line.length) {
        if (line[i] === '[') {
            // Find the closing bracket
            const closeIndex = line.indexOf(']', i);
            if (closeIndex !== -1) {
                const chordStr = line.substring(i, closeIndex + 1);
                const chord = parseNashville(chordStr);
                if (chord) {
                    chords.push({ chord, index: textIndex });
                    i = closeIndex + 1;
                    continue;
                }
            }
        }

        cleanText += line[i];
        textIndex++;
        i++;
    }

    return { text: cleanText, chords };
}

/**
 * Embed chords back into text at specified positions
 */
export function embedChordsInLine(text: string, chords: ChordPosition[]): string {
    // Sort chords by position in reverse order to insert from end
    const sortedChords = [...chords].sort((a, b) => b.index - a.index);

    let result = text;
    for (const { chord, index } of sortedChords) {
        const chordStr = `[${formatNashville(chord)}]`;
        result = result.slice(0, index) + chordStr + result.slice(index);
    }

    return result;
}
