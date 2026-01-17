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
