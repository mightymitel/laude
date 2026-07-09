/**
 * Derivation helpers: each seed song is authored once (ChordPro-style lines
 * with English chords) and everything else — degree ChordPro (the GLOBAL
 * storage format per DEC-45: Nashville degrees + a {key:} reference), the
 * Laudasist parts with bracketed Nashville chords, LRC timing, Tier-2
 * annotations — is derived from that single definition.
 */
import { convertChordPro, renderChordSymbol } from '@laude/chords';
import type { BeatGrid, ChordEvent, LrcLine, PerformanceSection } from '@laude/song-model';
import type { Arrangement, PartType, SongPart } from './laudasist-types';
import type { SeedSongDef } from './content/songs';

const CHORD_TOKEN = /\[([^\]]+)\]/g;

// ---------------------------------------------------------------------------
// ChordPro (global storage format: Nashville degrees + reference key)
// ---------------------------------------------------------------------------

const SECTION_DIRECTIVES: Partial<Record<PartType, 'verse' | 'chorus' | 'bridge'>> = {
  verse: 'verse',
  chorus: 'chorus',
  bridge: 'bridge',
};

export function buildChordPro(song: SeedSongDef): string {
  const out: string[] = [`{title: ${song.title}}`, `{key: ${song.key}}`, ''];
  for (const section of song.sections) {
    const directive = SECTION_DIRECTIVES[section.type] ?? 'verse';
    out.push(`{start_of_${directive}}`);
    out.push(...section.lines);
    out.push(`{end_of_${directive}}`, '');
  }
  // Seed definitions are authored with letter chords; storage holds degrees.
  return convertChordPro(out.join('\n'), { toNotation: 'nashville', key: song.key });
}

// ---------------------------------------------------------------------------
// Laudasist parts (bracketed Nashville chords, e.g. "[1]Amazing [4]grace")
// ---------------------------------------------------------------------------

const PART_ID_PREFIX: Record<PartType, string> = {
  verse: 'V',
  chorus: 'C',
  bridge: 'B',
  'pre-chorus': 'P',
  intro: 'I',
  outro: 'O',
  tag: 'T',
};

export function toNashvilleLine(line: string, key: string): string {
  return line.replace(CHORD_TOKEN, (_match, symbol: string) => {
    return `[${renderChordSymbol(symbol, 0, 'nashville', { key })}]`;
  });
}

export interface BuiltParts {
  parts: SongPart[];
  defaultArrangement: string[];
  arrangements: Arrangement[];
}

export function buildParts(song: SeedSongDef): BuiltParts {
  const counters = new Map<PartType, number>();
  const parts: SongPart[] = song.sections.map((section, index) => {
    const n = (counters.get(section.type) ?? 0) + 1;
    counters.set(section.type, n);
    return {
      id: `${PART_ID_PREFIX[section.type]}${n}`,
      type: section.type,
      index,
      lines: section.lines.map((line) => ({ text: toNashvilleLine(line, song.key) })),
    };
  });

  const chorusId = parts.find((p) => p.type === 'chorus')?.id;
  // Play the parts through in order, repeating the chorus after each later part.
  const order: string[] = [];
  for (const part of parts) {
    order.push(part.id);
    if (chorusId && part.id !== chorusId && parts.indexOf(part) > 0) order.push(chorusId);
  }

  const arrangements: Arrangement[] = [
    { id: 'arr-default', name: 'Standard', order, isDefault: true },
  ];
  return { parts, defaultArrangement: order, arrangements };
}

// ---------------------------------------------------------------------------
// LRC karaoke timing (plausible mock: one line every 8 beats)
// ---------------------------------------------------------------------------

export function stripChords(line: string): string {
  return line.replace(CHORD_TOKEN, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Mock LRC, structurally faithful: lyric lines land INSIDE the same section
 * template buildSections uses (nothing during Intro/Outro), so the alignment
 * matcher sees realistic evidence — a real LRC has no lines during
 * instrumental stretches.
 */
export function buildLrc(song: SeedSongDef, durationS: number): LrcLine[] {
  const lines: LrcLine[] = [];
  const verses = song.sections.filter((s) => s.type === 'verse');
  const chorus = song.sections.find((s) => s.type === 'chorus') ?? null;
  let verseIdx = 0;
  for (const tpl of SECTION_TEMPLATE) {
    let source: SeedSongDef['sections'][number] | null = null;
    if (/^Verse/.test(tpl.label)) {
      source = verses[verseIdx] ?? verses[verses.length - 1] ?? null;
      verseIdx += 1;
    } else if (tpl.label === 'Chorus') {
      source = chorus;
    }
    if (!source) continue; // Intro/Outro: no lyrics — instrumental by construction
    const from = tpl.from * durationS;
    const span = (tpl.to - tpl.from) * durationS;
    const step = span / (source.lines.length + 1);
    source.lines.forEach((line, i) => {
      lines.push({
        time_s: Math.round((from + step * (i + 1)) * 10) / 10,
        text: stripChords(line),
      });
    });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Tier-2 annotations (mock but structurally faithful)
// ---------------------------------------------------------------------------

/** Unique chords in first-appearance order (canonical English symbols). */
export function chordProgression(song: SeedSongDef): string[] {
  const seen = new Set<string>();
  for (const section of song.sections) {
    for (const line of section.lines) {
      for (const match of line.matchAll(CHORD_TOKEN)) {
        const symbol = match[1];
        if (symbol) seen.add(symbol);
      }
    }
  }
  return [...seen];
}

/** Section layout as fractions of the performance duration (times relative to performance start). */
const SECTION_TEMPLATE: { label: string; from: number; to: number }[] = [
  { label: 'Intro', from: 0, to: 0.08 },
  { label: 'Verse 1', from: 0.08, to: 0.3 },
  { label: 'Chorus', from: 0.3, to: 0.5 },
  { label: 'Verse 2', from: 0.5, to: 0.68 },
  { label: 'Chorus', from: 0.68, to: 0.88 },
  { label: 'Outro', from: 0.88, to: 1 },
];

export function buildSections(
  performanceId: string,
  durationS: number,
  bpm: number,
): PerformanceSection[] {
  const secondsPerBar = (4 * 60) / bpm;
  const labelCounts = new Map<string, number>();
  return SECTION_TEMPLATE.map((tpl, i) => {
    const start = Math.round(tpl.from * durationS * 10) / 10;
    const end = Math.round(tpl.to * durationS * 10) / 10;
    const ordinal = (labelCounts.get(tpl.label) ?? 0) + 1;
    labelCounts.set(tpl.label, ordinal);
    return {
      id: `sec-${performanceId}-${i + 1}`,
      performance_id: performanceId,
      label: tpl.label,
      ordinal,
      start_s: start,
      end_s: end,
      start_bar: Math.floor(start / secondsPerBar),
      end_bar: Math.floor(end / secondsPerBar),
      variation_of: null,
    };
  });
}

const MAX_BEATS = 128;

export function buildBeatGrid(performanceId: string, durationS: number, bpm: number): BeatGrid {
  const step = 60 / bpm;
  const count = Math.min(MAX_BEATS, Math.floor(durationS / step));
  const beats: number[] = [];
  const downbeats: number[] = [];
  for (let i = 0; i < count; i++) {
    beats.push(Math.round(i * step * 100) / 100);
    if (i % 4 === 0) downbeats.push(i);
  }
  return { performance_id: performanceId, bpm, beats, downbeats };
}

const MAX_CHORD_EVENTS = 48;

/** Cycle the song's progression, one chord every two bars, over the performance. */
export function buildChordEvents(progression: string[], durationS: number, bpm: number): ChordEvent[] {
  const secondsPerChord = (8 * 60) / bpm; // two 4/4 bars
  const events: ChordEvent[] = [];
  for (let i = 0; i < MAX_CHORD_EVENTS; i++) {
    const start = i * secondsPerChord;
    if (start >= durationS) break;
    const chord = progression[i % progression.length];
    if (!chord) break;
    events.push({ start_s: Math.round(start * 10) / 10, chord });
  }
  return events;
}
