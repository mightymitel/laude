import type { Key } from '../types/index.js';

/**
 * All 12 chromatic notes in order
 */
export const CHROMATIC_SCALE = [
    'C',
    'C#',
    'D',
    'D#',
    'E',
    'F',
    'F#',
    'G',
    'G#',
    'A',
    'A#',
    'B',
] as const;

/**
 * Enharmonic equivalents (flats to sharps)
 */
export const ENHARMONIC_MAP: Record<string, string> = {
    Db: 'C#',
    Eb: 'D#',
    Fb: 'E',
    Gb: 'F#',
    Ab: 'G#',
    Bb: 'A#',
    Cb: 'B',
};

/**
 * Major scale intervals (semitones from root)
 */
export const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Default chord qualities for each scale degree (1-7)
 * 1, 4, 5 = major; 2, 3, 6 = minor; 7 = diminished
 */
export const DEFAULT_QUALITIES: Record<number, string> = {
    1: '',
    2: 'm',
    3: 'm',
    4: '',
    5: '',
    6: 'm',
    7: 'dim',
};

/**
 * Get the index of a note in the chromatic scale
 */
export function getNoteIndex(note: string): number {
    const normalized = ENHARMONIC_MAP[note] ?? note;
    const index = CHROMATIC_SCALE.indexOf(normalized as (typeof CHROMATIC_SCALE)[number]);
    if (index === -1) {
        throw new Error(`Invalid note: ${note}`);
    }
    return index;
}

/**
 * Get the note name at a given chromatic index (0-11)
 */
export function getNoteAtIndex(index: number): string {
    return CHROMATIC_SCALE[((index % 12) + 12) % 12] ?? 'C';
}

/**
 * Get the notes of a major scale for a given key
 */
export function getMajorScaleNotes(key: Key): string[] {
    const rootIndex = getNoteIndex(key);
    return MAJOR_SCALE_INTERVALS.map(interval => getNoteAtIndex(rootIndex + interval));
}

/**
 * Calculate semitones between two keys
 */
export function getSemitonesBetweenKeys(fromKey: Key, toKey: Key): number {
    const fromIndex = getNoteIndex(fromKey);
    const toIndex = getNoteIndex(toKey);
    return ((toIndex - fromIndex + 12) % 12);
}

/**
 * Transpose a key by a number of semitones
 */
export function transposeKey(key: Key, semitones: number): Key {
    const currentIndex = getNoteIndex(key);
    const newIndex = ((currentIndex + semitones % 12) + 12) % 12;
    return getNoteAtIndex(newIndex) as Key;
}

/**
 * All possible keys to test
 */
export const ALL_KEYS: Key[] = [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

/**
 * Analyze a chord and return its root note and whether it's major or minor
 */
function analyzeLetterChord(chord: string): { root: string; isMajor: boolean } | null {
    const match = chord.match(/^([A-G])([b#]?)([a-z0-9]*)(?:\/.*)?$/i);
    if (!match) return null;

    const [, rootLetter, accidental, quality] = match;
    const root = `${rootLetter?.toUpperCase()}${accidental || ''}`;

    // Normalize flats to sharps for comparison
    const normalizedRoot = ENHARMONIC_MAP[root] ?? root;

    // Determine if major or minor based on quality
    const qualityLower = (quality || '').toLowerCase();
    const isMajor = !qualityLower.includes('m') && !qualityLower.includes('dim');

    return { root: normalizedRoot, isMajor };
}

/**
 * Detect the most likely key from a list of letter chords using music theory
 *
 * Algorithm:
 * - For each possible key, calculate a score based on how well the chords fit
 * - In a major key: I, IV, V are major; ii, iii, vi are minor
 * - Chords that match the expected quality get +1 score
 * - The root chord (I) gets +2 bonus if it appears
 * - Return the key with the highest score
 */
export function detectKeyFromChords(chords: string[]): Key {
    if (chords.length === 0) return 'C';

    // Parse all chords
    const analyzedChords = chords
        .map(c => analyzeLetterChord(c))
        .filter((c): c is NonNullable<typeof c> => c !== null);

    if (analyzedChords.length === 0) return 'C';

    let bestKey: Key = 'C';
    let bestScore = -1;

    // Test each possible key
    for (const testKey of ALL_KEYS) {
        let score = 0;
        const scaleNotes = getMajorScaleNotes(testKey);

        for (const { root, isMajor } of analyzedChords) {
            // Find which scale degree this chord is
            const degreeIndex = scaleNotes.indexOf(root);
            if (degreeIndex === -1) continue; // Not in this scale

            const degree = degreeIndex + 1; // 1-indexed

            // Check if the chord quality matches expected quality for this degree
            const expectedMajor = degree === 1 || degree === 4 || degree === 5;

            if (isMajor === expectedMajor) {
                score += 1;

                // Bonus points for the tonic (I) chord
                if (degree === 1) {
                    score += 2;
                }
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestKey = testKey;
        }
    }

    return bestKey;
}
