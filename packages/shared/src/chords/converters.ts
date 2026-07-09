
import { NashvilleChord } from './nashville.js';
import { ChordQuality } from '../types/index.js';

/**
 * Detect the likely notation system of a chord string
 */
/**
 * Detects the chord notation system used in a chord string.
 * 
 * - 'nashville': Numeric (1, 6m, 5/7)
 * - 'roman': Roman numerals (I, iv, V/vi)
 * - 'letter': Standard letter chords (C, Am, F#m, Bb/D)
 * 
 * @param chord The chord string to analyze (without brackets)
 * @returns 'nashville' | 'roman' | 'letter' | 'unknown'
 */
export function detectNotation(chord: string): 'nashville' | 'roman' | 'letter' | 'unknown' {
    // Nashville: Start with optional acc, then digit 1-7
    if (/^[b#]?[1-7]/.test(chord)) return 'nashville';

    // Roman: Start with optional acc, then I, V, i, v etc.
    if (/^[b#]?[ivIV]+/.test(chord)) return 'roman';

    // Letter: Start with A-G
    if (/^[A-G]/.test(chord)) return 'letter';

    return 'unknown';
}

/**
 * Roman Numeral to Nashville Degree map
 */
const ROMAN_TO_DEGREE: Record<string, number> = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7,
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7
};

/**
 * Convert Roman numeral chord to Nashville
 */
/**
 * Converts a Roman numeral chord to a Nashville Number System chord.
 * 
 * Handles:
 * - Case sensitivity: Uppercase = Major (IV), Lowercase = Minor (ii)
 * - Accidentals: bIII, #iv
 * - Slash chords: V/vi -> 5 with bass 6
 * - Qualities: V7 -> 5 with quality 7
 * 
 * @param chord The Roman chord string
 * @returns NashvilleChord object or null if invalid
 */
export function romanToNashville(chord: string): NashvilleChord | null {
    const match = chord.match(/^([b#]?)([ivIV]+)(.*)$/);
    if (!match) return null;

    const [, accidental, roman, rawRest] = match;

    // Safe access
    if (!roman || !ROMAN_TO_DEGREE[roman]) return null;
    const degree = ROMAN_TO_DEGREE[roman]!;

    const rest = rawRest || '';

    // Detect minor from lowercase roman if no quality specified
    const isLowerCase = roman === roman.toLowerCase();

    let quality = rest;

    // Handle slash chords: V/vi
    let bass: number | undefined;
    let bassAccidental: 'b' | '#' | undefined;

    if (quality.includes('/')) {
        const [q, bassStr] = quality.split('/');
        quality = q || ''; // Quality might be empty before slash

        // Parse bass part
        if (bassStr) {
            const bassMatch = bassStr.match(/^([b#]?)([ivIV]+)$/);
            if (bassMatch) {
                const [, acc, bassRoman] = bassMatch;
                if (bassRoman && ROMAN_TO_DEGREE[bassRoman]) {
                    bass = ROMAN_TO_DEGREE[bassRoman];
                    bassAccidental = (acc as 'b' | '#') || undefined;
                }
            } else {
                // Fallback: try parsing as number
                const bassNumMatch = bassStr.match(/^([b#]?)([1-7])$/);
                if (bassNumMatch) {
                    const [, acc, bassNum] = bassNumMatch;
                    bass = parseInt(bassNum || '1', 10);
                    bassAccidental = (acc as 'b' | '#') || undefined;
                }
            }
        }
    }

    // Default quality implied by case if no explicit quality
    if (isLowerCase && !quality) {
        // e.g. 'ii' -> degree 2, quality 'm'
        quality = 'm';
    }

    // Cast string to ChordQuality (validated at runtime/input level usually, but we cast here)
    const chordQuality = (quality as ChordQuality) || '';

    return {
        degree,
        accidental: (accidental as 'b' | '#') || undefined,
        quality: chordQuality,
        bass,
        bassAccidental
    };
}
