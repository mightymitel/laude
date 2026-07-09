/**
 * Degree charts: the {key:} directive grammar, mid-chart modulation frames,
 * and the RE-KEY operation (DEC-45/46/59/71, WP-101).
 *
 * GRAMMAR (position-based — Decision Log):
 *  - The FIRST {key:} in a chart is the REFERENCE KEY and holds a LETTER
 *    ("G", "F#m"). A degree chart without it is invalid: degrees are
 *    meaningless without a reference. (Letter charts — local/legacy sources —
 *    remain parseable without one; letters need no reference.)
 *  - EVERY SUBSEQUENT {key:} is a MODULATION ANCHOR and holds a DEGREE WITH
 *    MODE ({key: b2}, {key: 6m}). A letter there is a parse error, as is a
 *    degree at the head.
 *  - Anchors are RELATIVE TO THE HEAD KEY and ANCHORED, NOT CHAINED: every
 *    anchor is measured from [1] of the head key, never from the previous
 *    anchor. Order doesn't matter; any section resolves in one step; editing
 *    one modulation never moves the others.
 *  - {key: 1} is the head frame itself; serializers may normalize it away
 *    (re-key deliberately keeps it — see rekeyChordPro).
 *
 * DELIBERATE DIVERGENCE FROM THE CHORDPRO SPEC (DEC-71): standard ChordPro
 * {key:} is ABSOLUTE. Ours is relative after the head on purpose — an
 * absolute mid-chart key would be a second privileged key and would have to
 * be rewritten on every transposition; a relative one moves with the head
 * key for free. Do NOT "fix" this back to letters.
 *
 * TWO OPERATIONS, TWO SIGNATURES (DEC-59/60):
 *  - TRANSPOSE — a render-time choice: pass a different key to
 *    renderChordPro. Degrees untouched; storage no-op.
 *  - RE-KEY — the detected/analysis key was wrong: rekeyChordPro rewrites
 *    the chart so the ABSOLUTE pitches stay put under the corrected head key.
 */
import { FLAT_NAMES, SHARP_NAMES, keyPrefersFlats, keyRootPc } from './canonical';
import { formatDegreeSymbol, parseDegreeSymbol, rotateDegreeSymbol } from './notations';

const KEY_DIRECTIVE = /\{\s*key\s*:\s*([^}]*)\}/gi;
const LETTER_KEY = /^[A-G][#b]?m?$/;
const DEGREE_KEY = /^(?:b|#)?[1-7]m?$/;

export interface ModulationAnchor {
  /** Character offsets of the whole {key: …} directive in the source. */
  start: number;
  end: number;
  /** Semitone offset of the anchored frame's tonic from the head-key root. */
  rel: number;
  /** True when the anchored frame is minor ({key: 6m}). */
  minor: boolean;
  /** The directive value as written ("b2", "6m"). */
  raw: string;
}

export interface ChartKeyError {
  offset: number;
  message: string;
}

export interface ChartKeys {
  /** The reference key (letter) — null when the chart has no {key:} at all. */
  head: string | null;
  /** Head-directive offsets, for rewriting. Null iff head is null. */
  headRange: { start: number; end: number } | null;
  anchors: ModulationAnchor[];
  errors: ChartKeyError[];
}

/** Scan a chart for {key:} directives and classify them by the grammar. */
export function scanChartKeys(chordpro: string): ChartKeys {
  const result: ChartKeys = { head: null, headRange: null, anchors: [], errors: [] };
  for (const match of chordpro.matchAll(KEY_DIRECTIVE)) {
    const value = (match[1] ?? '').trim();
    const start = match.index;
    const end = start + match[0].length;
    if (result.head === null && result.headRange === null) {
      if (LETTER_KEY.test(value)) {
        result.head = value;
        result.headRange = { start, end };
      } else {
        result.errors.push({
          offset: start,
          message: `head {key:} must be a letter key ("G", "F#m"); got "${value}"`,
        });
        // Consume the head slot so later directives are still judged as anchors.
        result.headRange = { start, end };
      }
      continue;
    }
    const parsed = parseDegreeAnchor(value);
    if (parsed === null) {
      result.errors.push({
        offset: start,
        message: `mid-chart {key:} must be a degree relative to the head key ("b2", "6m"); got "${value}"`,
      });
      continue;
    }
    result.anchors.push({ start, end, ...parsed, raw: value });
  }
  return result;
}

function parseDegreeAnchor(value: string): { rel: number; minor: boolean } | null {
  if (!DEGREE_KEY.test(value)) return null;
  const minor = value.endsWith('m');
  const parsed = parseDegreeSymbol(minor ? value.slice(0, -1) : value);
  if (!parsed || parsed.quality !== '' || parsed.bassRel !== undefined) return null;
  return { rel: parsed.rel, minor };
}

/** The letter key of an anchored frame: head key + rel semitones (+ mode). */
export function anchorKeyName(headKey: string, rel: number, minor: boolean): string {
  const headPc = keyRootPc(headKey);
  if (headPc === null) return headKey;
  const pc = (((headPc + rel) % 12) + 12) % 12;
  const candidateSharp = SHARP_NAMES[pc] + (minor ? 'm' : '');
  const candidateFlat = FLAT_NAMES[pc] + (minor ? 'm' : '');
  return keyPrefersFlats(candidateFlat) ? candidateFlat : candidateSharp;
}

export interface ChartSegment {
  /** Segment text with the anchor directive (if any) stripped. */
  text: string;
  /** The frame's key, derived from the head key passed in. */
  key: string;
  /** Frame offset from head (0 for the head frame). */
  rel: number;
  minor: boolean;
}

/**
 * Split a chart into key frames: the head-frame prefix, then one segment per
 * modulation anchor (anchored to `headKey`, which may be a render override —
 * relative anchors move with the head key for free).
 */
export function segmentChartByKey(chordpro: string, headKey: string): ChartSegment[] {
  const { anchors } = scanChartKeys(chordpro);
  if (anchors.length === 0) return [{ text: chordpro, key: headKey, rel: 0, minor: false }];
  const segments: ChartSegment[] = [];
  const first = anchors[0]!;
  segments.push({ text: chordpro.slice(0, first.start), key: headKey, rel: 0, minor: false });
  anchors.forEach((anchor, i) => {
    const next = anchors[i + 1];
    segments.push({
      text: chordpro.slice(anchor.end, next?.start),
      key: anchorKeyName(headKey, anchor.rel, anchor.minor),
      rel: anchor.rel,
      minor: anchor.minor,
    });
  });
  return segments;
}

/**
 * Validate a chart that claims to be a DEGREE chart (global storage,
 * local_songs.chordpro). Letter charts should not be passed here.
 */
export function validateDegreeChart(chordpro: string): ChartKeyError[] {
  const { head, errors } = scanChartKeys(chordpro);
  if (head === null) {
    return [
      { offset: 0, message: 'a degree chart must carry a head {key: <letter>} reference key' },
      ...errors,
    ];
  }
  return errors;
}

/**
 * RE-KEY (DEC-59): the analysis key was wrong. Rewrites the chart so the
 * ABSOLUTE pitches on disk stay put under the corrected head key:
 *  - the head {key:} directive becomes `newKey`;
 *  - every degree in the HEAD FRAME (before the first anchor) rotates by the
 *    interval oldKey→newKey;
 *  - every ANCHOR VALUE rotates by the same interval — which keeps each
 *    anchored frame's absolute tonic fixed, so degrees INSIDE anchored
 *    frames are untouched (rotating them too would shift pitches twice);
 *  - an anchor landing on {key: 1} is KEPT, not normalized away — dropping
 *    it would merge the frame into the head frame and break the inverse
 *    rotation (re-key then its inverse must be byte-identical).
 * Hand-corrections survive: this is a bracket/directive-level rewrite; no
 * lyrics, whitespace or unparseable tokens are touched.
 */
export function rekeyChordPro(chordpro: string, newKey: string): string {
  const { head, headRange, anchors, errors } = scanChartKeys(chordpro);
  if (head === null || headRange === null) {
    throw new Error('rekeyChordPro: chart has no head {key:} reference key' +
      (errors[0] ? ` (${errors[0].message})` : ''));
  }
  if (errors.length > 0) {
    throw new Error(`rekeyChordPro: invalid {key:} directives — ${errors[0]!.message}`);
  }
  const oldPc = keyRootPc(head);
  const newPc = keyRootPc(newKey);
  if (oldPc === null || newPc === null) {
    throw new Error(`rekeyChordPro: unparseable key ("${head}" → "${newKey}")`);
  }
  // Degrees move opposite to the reference: pitch = key + degree stays put.
  const delta = (((oldPc - newPc) % 12) + 12) % 12;

  const firstAnchorStart = anchors[0]?.start ?? chordpro.length;

  // Head frame: rotate bracket degrees, then rewrite the head directive
  // (which sits in the head frame by construction — it precedes any anchor).
  const rotatedHeadFrame = chordpro.slice(0, firstAnchorStart).replace(
    /\[([^\]]+)\]/g,
    (whole, token: string) => {
      const rotated = rotateDegreeSymbol(token, delta);
      return rotated === null ? whole : `[${rotated}]`;
    },
  );
  let out = rewriteHeadDirective(rotatedHeadFrame, newKey);

  // Anchored frames: rotate only the anchor values; inner degrees stay put.
  let cursor = firstAnchorStart;
  for (const anchor of anchors) {
    out += chordpro.slice(cursor, anchor.start);
    out += `{key: ${degreeKeyValue(anchor.rel + delta, anchor.minor)}}`;
    cursor = anchor.end;
  }
  out += chordpro.slice(cursor);
  return out;
}

/** Canonical degree-with-mode spelling for an anchor value ("b2", "6m", "1"). */
function degreeKeyValue(rel: number, minor: boolean): string {
  return formatDegreeSymbol({ rel: ((rel % 12) + 12) % 12, quality: '' }) + (minor ? 'm' : '');
}

function rewriteHeadDirective(headFrameText: string, newKey: string): string {
  // The head directive is the first {key:} in the (already degree-rotated)
  // head frame; bracket rewrites never touch {…} so the regex still matches.
  let replaced = false;
  return headFrameText.replace(KEY_DIRECTIVE, (whole) => {
    if (replaced) return whole;
    replaced = true;
    return `{key: ${newKey}}`;
  });
}
