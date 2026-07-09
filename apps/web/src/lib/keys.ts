/** Key narrowing shared by the session views (session state carries keys as
 * plain strings; the chord renderer wants the Key union). */
import type { ChordStyle, Key } from '@laudasist/shared'

export const POSSIBLE_KEYS: Key[] = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F']

export function asKey(value: string | null | undefined, fallback: Key = 'C'): Key {
    return POSSIBLE_KEYS.find((k) => k === value) ?? fallback
}

const CHORD_STYLES: ChordStyle[] = ['nashville', 'letters', 'roman', 'caseSensitive']

export function asChordStyle(value: string | null | undefined): ChordStyle {
    return CHORD_STYLES.find((s) => s === value) ?? 'letters'
}
