/** Standard-tuning guitar strings and nearest-string snapping (pure). */
import { centsBetween, clampCents } from './pitch-math';

export interface GuitarString {
  /** Conventional string number: 6 = low E, 1 = high E. */
  number: number;
  /** Integer MIDI of the string's target pitch. */
  midi: number;
}

/** Standard tuning EADGBE, low to high: E2 A2 D3 G3 B3 E4. */
export const GUITAR_STRINGS: readonly GuitarString[] = [
  { number: 6, midi: 40 },
  { number: 5, midi: 45 },
  { number: 4, midi: 50 },
  { number: 3, midi: 55 },
  { number: 2, midi: 59 },
  { number: 1, midi: 64 },
];

/** The standard-tuning string closest to a (fractional) MIDI pitch. */
export function nearestGuitarString(midi: number): GuitarString {
  let best = GUITAR_STRINGS[0];
  for (const s of GUITAR_STRINGS) {
    if (Math.abs(midi - s.midi) < Math.abs(midi - best.midi)) best = s;
  }
  return best;
}

/** Cents from the nearest string's target pitch, clamped to ±50 for display. */
export function centsToGuitarString(midi: number, target: GuitarString): number {
  return clampCents(centsBetween(midi, target.midi));
}
