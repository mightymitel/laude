/**
 * Chord-name → pitch helpers for the pad synth (pure; unit-testable without
 * Web Audio). Handles majors/minors and extensions like "Bb", "Gm", "F#m7",
 * "D/F#" — only the root pitch class matters for the drone voicing
 * (root + fifth + octave, no third, so quality is irrelevant).
 */

const LETTER_PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class 0..11 (C = 0) of a chord symbol's root, or null when unparseable. */
export function parseChordRoot(chord: string): number | null {
  const match = /^\s*([A-G])([#b]?)/.exec(chord);
  if (!match) return null;
  let pc = LETTER_PITCH_CLASS[match[1]];
  if (match[2] === '#') pc = (pc + 1) % 12;
  else if (match[2] === 'b') pc = (pc + 11) % 12;
  return pc;
}

/** Drone root frequency: the pitch class voiced in the C3..B3 octave (C3 = MIDI 48). */
export function rootFrequencyHz(pitchClass: number): number {
  return 440 * Math.pow(2, (48 + pitchClass - 69) / 12);
}
