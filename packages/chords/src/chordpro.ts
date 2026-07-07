/**
 * ChordPro rendering on top of ChordSheetJS. Storage format is canonical
 * ChordPro with English chord symbols; rendering transposes + re-spells per
 * the chosen notation. Returns plain data the apps render themselves.
 */
import { ChordProParser } from 'chordsheetjs';
import { transposeChord, semitonesBetweenKeys } from './canonical';
import { NotationContext, getNotation, parseCanonical } from './notations';

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
 */
export function renderChordPro(chordpro: string, options: RenderOptions = {}): RenderedSong {
  const parsed = new ChordProParser().parse(chordpro);
  const sourceKey = (parsed.key ?? '').toString() || 'C';
  const transpose = options.transpose ?? 0;
  const targetKey = options.key ?? transposeKeyName(sourceKey, transpose);
  const notation = getNotation(options.notation ?? 'english') ?? getNotation('english')!;
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
          items.push({
            chord: renderChordSymbol(maybe.chords, transpose, notation.id, ctx),
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
      });
    }
  }

  return {
    title: (parsed.title ?? '').toString(),
    key: targetKey,
    sections,
  };
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
