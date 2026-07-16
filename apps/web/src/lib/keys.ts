/** Key narrowing shared by the session views (session state carries keys as
 * plain strings; the chord renderer wants the Key union). */
import type { ChordStyle, Key } from '@laudasist/shared'

// The FULL Key union, chromatic with enharmonics adjacent. Songs legitimately
// carry any of these spellings (defaultKey 'F#' exists in the library), so
// the session key pickers and asKey must accept them all — the old 12-key
// circle-of-fifths list silently coerced F#/C#/D#/G#/A# to the fallback
// (WP-162 found it: a favorite key of F# revived as C). Pad lookup folds
// enharmonics itself (KEY_TO_PAD_INFO covers the whole union).
export const POSSIBLE_KEYS: Key[] = [
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
]

export function asKey(value: string | null | undefined, fallback: Key = 'C'): Key {
    return POSSIBLE_KEYS.find((k) => k === value) ?? fallback
}

const CHORD_STYLES: ChordStyle[] = ['nashville', 'letters', 'roman', 'caseSensitive']

export function asChordStyle(value: string | null | undefined): ChordStyle {
    return CHORD_STYLES.find((s) => s === value) ?? 'letters'
}
