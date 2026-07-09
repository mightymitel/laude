/**
 * Canonical chord model. Everything (storage, transpose, key changes) operates
 * here; notations are only bidirectional adapters on top.
 */

/** 0 = C, 1 = C#/Db, … 11 = B. */
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface CanonicalChord {
  root: PitchClass;
  /** Quality/extensions suffix as written: '', 'm', '7', 'maj7', 'sus4', 'm7', 'dim', … */
  quality: string;
  bass?: PitchClass;
  /** Preferred spelling when re-formatting (from the source or the key context). */
  accidental: 'sharp' | 'flat';
}

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const NOTE_TO_PC: Record<string, number> = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

export function pitchClassOf(note: string): PitchClass | null {
  const pc = NOTE_TO_PC[note];
  return pc === undefined ? null : (pc as PitchClass);
}

export function transposePc(pc: PitchClass, semitones: number): PitchClass {
  return ((((pc + semitones) % 12) + 12) % 12) as PitchClass;
}

export function transposeChord(chord: CanonicalChord, semitones: number): CanonicalChord {
  return {
    ...chord,
    root: transposePc(chord.root, semitones),
    bass: chord.bass === undefined ? undefined : transposePc(chord.bass, semitones),
  };
}

/** Semitone distance from key A to key B (both canonical English key names, e.g. "G", "F#m"). */
export function semitonesBetweenKeys(fromKey: string, toKey: string): number | null {
  const from = keyRootPc(fromKey);
  const to = keyRootPc(toKey);
  if (from === null || to === null) return null;
  return (((to - from) % 12) + 12) % 12;
}

export function keyRootPc(key: string): PitchClass | null {
  const m = key.trim().match(/^([A-G][#b]?)/);
  return m ? pitchClassOf(m[1]) : null;
}

export function keyIsMinor(key: string): boolean {
  return /m(?!aj)/.test(key.trim().slice(1));
}

/** Major keys spelled with flats (F Bb Eb Ab Db Gb) by pitch class. */
const FLAT_MAJOR_ROOTS = new Set<number>([5, 10, 3, 8, 1, 6]);
/** Minor keys spelled with flats (Dm Gm Cm Fm Bbm Ebm) by pitch class. */
const FLAT_MINOR_ROOTS = new Set<number>([2, 7, 0, 5, 10, 3]);

/** Whether chords in this key conventionally spell accidentals as flats. */
export function keyPrefersFlats(key: string): boolean {
  const trimmed = key.trim();
  if (/^[A-G]b/.test(trimmed)) return true;
  if (/^[A-G]#/.test(trimmed)) return false;
  const pc = keyRootPc(trimmed);
  if (pc === null) return false;
  return keyIsMinor(trimmed) ? FLAT_MINOR_ROOTS.has(pc) : FLAT_MAJOR_ROOTS.has(pc);
}
