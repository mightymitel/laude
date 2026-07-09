/**
 * Degree-storage line rendering for viewports: split "[1]Amazing [4]grace"
 * into a positioned chord line + clean lyrics, formatting every chord through
 * @laude/chords in the DEVICE's notation (DEC-42/45). Handles legacy letter
 * tokens too (parseChordInKey falls back to canonical English).
 */
import { getNotation, parseChordInKey } from '@laude/chords';

const TOKEN = /\[([^\]]+)\]/g;

export interface RenderedLinePair {
  /** Monospace-aligned chord row ('' when the line has no chords). */
  chordLine: string;
  text: string;
}

export function formatChordToken(token: string, key: string, notationId: string): string {
  const canonical = parseChordInKey(token, key);
  if (canonical === null) return token;
  const notation = getNotation(notationId) ?? getNotation('english')!;
  return notation.format(canonical, { key });
}

/** Chords positioned above the syllable they precede (monospace alignment). */
export function renderLine(lineText: string, key: string, notationId: string): RenderedLinePair {
  let chordLine = '';
  let text = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((match = TOKEN.exec(lineText)) !== null) {
    text += lineText.slice(lastIndex, match.index);
    const chord = formatChordToken(match[1], key, notationId);
    const pad = Math.max(0, text.length - chordLine.length);
    chordLine += ' '.repeat(pad) + chord + ' ';
    lastIndex = match.index + match[0].length;
  }
  text += lineText.slice(lastIndex);
  return { chordLine: chordLine.trimEnd(), text };
}

/** Lyrics only (chords stripped) — the {{lyrics}} placeholder. */
export function stripChordTokens(lineText: string): string {
  return lineText.replace(TOKEN, '');
}
