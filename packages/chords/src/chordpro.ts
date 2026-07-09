/**
 * ChordPro rendering on top of ChordSheetJS. GLOBAL storage format (DEC-45):
 * ChordPro is the container, the bracket content is Nashville DEGREES plus a
 * `{key: X}` reference key used only to render a default — letters are a
 * rendering, produced per-device through the notation registry. Letter
 * chordpro (legacy/local sources) still parses; `convertChordPro` moves
 * between the two.
 */
// Default-import interop: chordsheetjs v12 is CJS-only (no ESM exports map);
// a named import fails under plain node ESM (tsx tests) though bundlers cope.
import ChordSheetJS from 'chordsheetjs';

const { ChordProParser } = ChordSheetJS;
import { transposeChord, semitonesBetweenKeys } from './canonical';
import { anchorKeyName, scanChartKeys, segmentChartByKey } from './degrees';
import {
  NotationContext,
  getNotation,
  isDegreeToken,
  nashvilleNotation,
  parseCanonical,
} from './notations';
import type { CanonicalChord } from './canonical';

export interface RenderedChordLyricPair {
  /** Formatted chord in the requested notation ('' when none). */
  chord: string;
  lyrics: string;
}

export interface RenderedLine {
  items: RenderedChordLyricPair[];
}

export interface RenderedSection {
  /** verse / chorus / bridge / none … from ChordPro section directives. */
  type: string;
  label: string;
  lines: RenderedLine[];
  /** The key this section renders in — differs from the song key after a
   * mid-chart {key: <degree>} modulation anchor (DEC-71). */
  key: string;
}

export interface RenderedSong {
  title: string;
  key: string;
  sections: RenderedSection[];
}

export interface RenderOptions {
  /** Target notation id (default 'english'). */
  notation?: string;
  /** Transpose amount in semitones (applied after key detection). */
  transpose?: number;
  /** Override the song key context (e.g. session-selected key). */
  key?: string;
}

/**
 * Parse canonical ChordPro and render to plain data: chords transposed by
 * `options.transpose` and formatted in `options.notation`.
 *
 * Mid-chart `{key: <degree>}` modulation anchors (DEC-71) re-anchor the
 * degree frame relative to the head key. Because anchors are RELATIVE, a
 * render key override (`options.key`) or a transpose moves every modulated
 * section along with the head for free.
 */
export function renderChordPro(chordpro: string, options: RenderOptions = {}): RenderedSong {
  const scanned = scanChartKeys(chordpro);
  if (scanned.anchors.length === 0) {
    const parsed = new ChordProParser().parse(chordpro);
    const sourceKey = (parsed.key ?? '').toString() || 'C';
    const transpose = options.transpose ?? 0;
    const targetKey = options.key ?? transposeKeyName(sourceKey, transpose);
    return {
      title: (parsed.title ?? '').toString(),
      key: targetKey,
      sections: renderSections(parsed, sourceKey, transpose, targetKey, options.notation),
    };
  }

  const head = scanned.head ?? 'C';
  const transpose = options.transpose ?? 0;
  const targetHead = options.key ?? transposeKeyName(head, transpose);
  // One interval covers every frame: anchors are pure offsets from the head.
  const semitones = transposeAmount(head, targetHead);

  let title = '';
  const sections: RenderedSection[] = [];
  for (const segment of segmentChartByKey(chordpro, head)) {
    const segmentTarget =
      segment.rel === 0 && !segment.minor
        ? targetHead
        : anchorKeyName(targetHead, segment.rel, segment.minor);
    const parsed = new ChordProParser().parse(segment.text);
    const parsedTitle = (parsed.title ?? '').toString();
    if (parsedTitle) title = parsedTitle;
    sections.push(...renderSections(parsed, segment.key, semitones, segmentTarget, options.notation));
  }
  return { title, key: targetHead, sections };
}

type ParsedSong = ReturnType<InstanceType<typeof ChordProParser>['parse']>;

function renderSections(
  parsed: ParsedSong,
  sourceKey: string,
  transpose: number,
  targetKey: string,
  notationId?: string,
): RenderedSection[] {
  const notation = getNotation(notationId ?? 'english') ?? getNotation('english')!;
  const ctx: NotationContext = { key: targetKey };
  const sections: RenderedSection[] = [];
  for (const paragraph of parsed.paragraphs) {
    const lines: RenderedLine[] = [];
    for (const line of paragraph.lines) {
      const items: RenderedChordLyricPair[] = [];
      for (const item of line.items) {
        // ChordLyricsPair duck-typing: has .chords + .lyrics strings.
        const maybe = item as { chords?: unknown; lyrics?: unknown };
        if (typeof maybe.chords === 'string' && typeof maybe.lyrics === 'string') {
          const canonical = parseChordInKey(maybe.chords, sourceKey);
          items.push({
            chord:
              canonical === null
                ? maybe.chords.trim()
                : notation.format(transposeChord(canonical, transpose), ctx),
            lyrics: maybe.lyrics,
          });
        }
      }
      if (items.length > 0) lines.push({ items });
    }
    if (lines.length > 0) {
      sections.push({
        type: paragraph.type ?? 'none',
        label: paragraph.label || defaultSectionLabel(paragraph.type ?? 'none'),
        lines,
        key: targetKey,
      });
    }
  }
  return sections;
}

/**
 * Parse one chord token from stored chordpro: Nashville degrees resolve
 * against the reference key; anything else parses as canonical English.
 * The single boundary between storage (degrees) and pitch classes.
 */
export function parseChordInKey(symbol: string, key: string): CanonicalChord | null {
  const trimmed = symbol.trim();
  if (!trimmed) return null;
  if (isDegreeToken(trimmed)) return nashvilleNotation.parse(trimmed, { key });
  return parseCanonical(trimmed);
}

export interface ConvertOptions {
  /** Target notation for the bracket content ('nashville' for storage). */
  toNotation: string;
  /** Reference key: source key when converting letters→degrees, and the
   * rendered key when converting degrees→letters. */
  key: string;
}

/**
 * Rewrite a chordpro string's bracket content into another notation, leaving
 * lyrics + directives untouched. Converting TO degrees ensures a `{key:}`
 * directive (the reference key) is present. Unparseable tokens pass through.
 */
export function convertChordPro(chordpro: string, options: ConvertOptions): string {
  const notation = getNotation(options.toNotation) ?? getNotation('english')!;
  const ctx: NotationContext = { key: options.key };
  let out = chordpro.replace(/\[([^\]]+)\]/g, (whole, token: string) => {
    const canonical = parseChordInKey(token, options.key);
    if (canonical === null) return whole;
    return `[${notation.format(canonical, ctx)}]`;
  });
  if (options.toNotation === 'nashville' && !/\{key\s*:/i.test(out)) {
    out = `{key: ${options.key}}\n${out}`;
  }
  return out;
}

/** Transpose + re-spell one canonical English chord symbol. Unparseable symbols pass through. */
export function renderChordSymbol(
  symbol: string,
  transpose: number,
  notationId: string,
  ctx: NotationContext,
): string {
  const trimmed = symbol.trim();
  if (!trimmed) return '';
  const canonical = parseCanonical(trimmed);
  if (!canonical) return trimmed;
  const notation = getNotation(notationId) ?? getNotation('english')!;
  return notation.format(transposeChord(canonical, transpose), ctx);
}

export function transposeKeyName(key: string, semitones: number): string {
  const canonical = parseCanonical(key);
  if (!canonical) return key;
  const englishNotation = getNotation('english')!;
  return englishNotation.format(transposeChord(canonical, semitones));
}

/** Semitones to move from a song's original key to a chosen key name. */
export function transposeAmount(fromKey: string, toKey: string): number {
  return semitonesBetweenKeys(fromKey, toKey) ?? 0;
}

function defaultSectionLabel(type: string): string {
  switch (type) {
    case 'chorus':
      return 'Chorus';
    case 'verse':
      return 'Verse';
    case 'bridge':
      return 'Bridge';
    default:
      return '';
  }
}
