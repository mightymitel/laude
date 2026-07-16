/**
 * Viewport line rendering — thin delegates to the shared rendering core
 * (WP-165); the layout math lives in rendering/core.ts, characterized by
 * the WP-164 goldens. Kept as a module so viewport consumers keep their
 * import path; new code should import from @/rendering/core directly.
 */
import { lineToMonospacePair, spellToken } from '@/rendering/core';

export interface RenderedLinePair {
  /** Monospace-aligned chord row ('' when the line has no chords). */
  chordLine: string;
  text: string;
}

export function formatChordToken(token: string, key: string, notationId: string): string {
  return spellToken(token, key, notationId);
}

/** Chords positioned above the syllable they precede (monospace alignment). */
export function renderLine(lineText: string, key: string, notationId: string): RenderedLinePair {
  return lineToMonospacePair(lineText, key, notationId);
}

/** Lyrics only (chords stripped) — the {{lyrics}} placeholder. */
export function stripChordTokens(lineText: string): string {
  return lineText.replace(/\[([^\]]+)\]/g, '');
}
