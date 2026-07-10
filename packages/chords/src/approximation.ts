/**
 * Chord approximation across parts (DEC-107 — load-bearing for the import
 * content path): source sites annotate chords on verse 1 only; this
 * extrapolates them onto verses that lack them by proportional character
 * position. Ported from @laudasist/shared (WP-32 absorption) minus the
 * never-implemented syllable-mapping placeholder.
 *
 * Tokens are treated as OPAQUE bracket contents — the same functions work on
 * degree charts (`[1]`, `[4m]`, `[5/7]`) and on letter charts in any display
 * notation (`[Am7]`, `[D/F#]`).
 */

/** A chord token and its character position in the chord-free text. */
export interface ChordTokenPosition {
  token: string;
  index: number;
}

/** The slice of a song part these functions need; extra fields pass through. */
export interface ApproximableLine {
  text: string;
}
export interface ApproximablePart {
  lines: ApproximableLine[];
}

/**
 * Split a line with inline brackets into clean text + positioned tokens.
 * A bracket pair counts as a chord token when its content is non-empty and
 * whitespace-free; anything else stays literal text.
 */
export function extractChordTokens(line: string): { text: string; tokens: ChordTokenPosition[] } {
  const tokens: ChordTokenPosition[] = [];
  let text = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] === '[') {
      const close = line.indexOf(']', i);
      const inner = close === -1 ? '' : line.slice(i + 1, close);
      if (inner !== '' && !/\s/.test(inner)) {
        tokens.push({ token: inner, index: text.length });
        i = close + 1;
        continue;
      }
    }
    text += line[i];
    i++;
  }
  return { text, tokens };
}

/** Re-embed tokens into clean text at their positions (inverse of extract). */
export function embedChordTokens(text: string, tokens: ChordTokenPosition[]): string {
  const sorted = [...tokens].sort((a, b) => b.index - a.index);
  let result = text;
  for (const { token, index } of sorted) {
    const at = Math.max(0, Math.min(index, result.length));
    result = `${result.slice(0, at)}[${token}]${result.slice(at)}`;
  }
  return result;
}

function approximateLine(sourceLine: ApproximableLine, targetLine: ApproximableLine): ApproximableLine {
  const { text: sourceText, tokens } = extractChordTokens(sourceLine.text);
  const { text: targetText } = extractChordTokens(targetLine.text);
  const mapped = tokens.map(({ token, index }) => ({
    token,
    index: sourceText.length === 0 ? 0 : Math.round((index / sourceText.length) * targetText.length),
  }));
  return { ...targetLine, text: embedChordTokens(targetText, mapped) };
}

/**
 * Extrapolate the source part's chords onto the target part, mapping each
 * chord to the proportional character position of the target line. Target
 * lines beyond the source's count reuse source lines cyclically; existing
 * target chords are replaced.
 */
export function approximateChordsFromPart<P extends ApproximablePart>(sourcePart: P, targetPart: P): P {
  if (sourcePart.lines.length === 0) return targetPart;
  const lines = targetPart.lines.map((targetLine, i) => {
    const sourceLine = sourcePart.lines[i % sourcePart.lines.length];
    return sourceLine === undefined ? targetLine : approximateLine(sourceLine, targetLine);
  });
  return { ...targetPart, lines };
}

/**
 * Copy the source part's chords onto the target at the SAME character
 * positions (no proportional mapping) — for identically-phrased lines.
 * Only line indexes present in both parts are touched.
 */
export function copyChordsFromPart<P extends ApproximablePart>(sourcePart: P, targetPart: P): P {
  const lines = targetPart.lines.map((targetLine, i) => {
    const sourceLine = sourcePart.lines[i];
    if (sourceLine === undefined) return targetLine;
    const { tokens } = extractChordTokens(sourceLine.text);
    const { text: targetText } = extractChordTokens(targetLine.text);
    return { ...targetLine, text: embedChordTokens(targetText, tokens) };
  });
  return { ...targetPart, lines };
}
