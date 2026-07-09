/**
 * Pure pitch math — no Web Audio, no DOM. Everything here is unit-testable
 * under plain Node. MIDI numbers are the spine: fractional MIDI carries the
 * exact pitch, integer MIDI names a note (A4 = 69).
 */

export const A4_DEFAULT_HZ = 440;

/** Hz → fractional MIDI number (A4 = 69 at `a4` Hz). */
export function hzToMidi(hz: number, a4: number = A4_DEFAULT_HZ): number {
  return 69 + 12 * Math.log2(hz / a4);
}

/** MIDI number (fractional ok) → Hz. */
export function midiToHz(midi: number, a4: number = A4_DEFAULT_HZ): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Pitch class (0–11, C = 0) of an integer MIDI note. */
export function noteIndexOf(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/** Scientific octave of an integer MIDI note (A4 = 69 → 4). */
export function octaveOf(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

/** Signed cents from `refMidi` to `midi` (100 cents per semitone). */
export function centsBetween(midi: number, refMidi: number): number {
  return (midi - refMidi) * 100;
}

/** Clamp a cents value to the displayable ±50 range. */
export function clampCents(cents: number): number {
  return Math.max(-50, Math.min(50, cents));
}

/**
 * Median of a non-empty list. For even lengths the lower-middle element is
 * used (a real observed value, never an average of two octaves).
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error('median() requires at least one value');
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
