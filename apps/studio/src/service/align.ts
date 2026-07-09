/**
 * Auto-alignment: performance sections → work parts (WP-103, DEC-63).
 *
 * The matcher is text-to-text and FUZZY BY CONSTRUCTION: the LRC was aligned
 * against transcribed lyrics while snapshot_parts carries someone else's
 * typed lyrics — same song, different strings. It returns a SCORE, never an
 * equality test.
 *
 *  - lyric-less sections → is_instrumental (most of the residue)
 *  - score ≥ threshold  → auto-accepted (source auto) — DRIVES
 *  - score < threshold  → held as a proposal — announces instrumental
 *
 * The threshold is a TUNABLE, not a spec constant. The same matcher is the
 * autosync mechanism when snapshot_parts drifts: re-run it; no stored
 * correspondence is needed (DEC-56).
 */
import type { LrcLine } from '@laude/song-model';
import type { LocalStore, SectionPartMapRow, SectionRow, SnapshotPart } from '../store';
import { isInstrumentalLabel } from '../store/partmap';
import { normalizeLyric } from './snapshot';

/** Tunable: a confident lyric match inside an already-confirmed song. */
export const ALIGN_THRESHOLD = 0.45;

/** Token-set Dice similarity of two normalized lyric strings. */
export function lyricSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeLyric(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeLyric(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return (2 * common) / (ta.size + tb.size);
}

export interface AlignmentInput {
  sections: SectionRow[];
  /** LRC of the performance (section lyrics come from time ranges). */
  lrc: LrcLine[];
  parts: SnapshotPart[];
}

/** The section's OPENING lyric lines (from LRC), because snapshot_parts
 * carries each part's FIRST line — first-lines against first-line keeps the
 * comparison apples-to-apples instead of diluting a long verse's tokens. */
const OPENING_LINES = 2;

function sectionLyrics(section: SectionRow, lrc: LrcLine[]): string {
  return lrc
    .filter((l) => l.time_s >= section.start_s && l.time_s < section.end_s)
    .slice(0, OPENING_LINES)
    .map((l) => l.text)
    .join(' ');
}

export function alignSections(
  input: AlignmentInput,
  threshold = ALIGN_THRESHOLD,
): SectionPartMapRow[] {
  // No LRC at all = no signal: leave everything UNALIGNED rather than
  // stamping every section as deliberately instrumental (DEC-63's
  // "lyric-less → instrumental" presumes an LRC exists to be absent from).
  if (input.lrc.length === 0) return [];
  const rows: SectionPartMapRow[] = [];
  for (const section of input.sections) {
    const lyrics = sectionLyrics(section, input.lrc);
    // An explicit Intro/Outro/Instrumental label wins over stray LRC lines
    // bleeding into the range — the label is interpretation-level intent.
    if (isInstrumentalLabel(section.label) || normalizeLyric(lyrics) === '') {
      rows.push({
        section_id: section.id,
        part_label: null,
        part_ordinal: null,
        is_instrumental: true,
        accepted: true,
        confidence: 1,
        source: 'auto',
      });
      continue;
    }
    let best: SnapshotPart | null = null;
    let bestScore = 0;
    for (const part of input.parts) {
      if (part.first_line.trim() === '') continue;
      const score = lyricSimilarity(lyrics, part.first_line);
      if (score > bestScore) {
        best = part;
        bestScore = score;
      }
    }
    if (best === null || bestScore === 0) continue; // unaligned: no row
    rows.push({
      section_id: section.id,
      part_label: best.label,
      part_ordinal: best.ordinal,
      is_instrumental: false,
      accepted: bestScore >= threshold,
      confidence: Math.round(bestScore * 100) / 100,
      source: 'auto',
    });
  }
  return rows;
}

/** Run the matcher against a stored performance and persist the result. */
export function alignPerformance(
  store: LocalStore,
  performanceId: string,
  parts: SnapshotPart[],
  threshold = ALIGN_THRESHOLD,
): SectionPartMapRow[] {
  const perf = store.getPerformance(performanceId);
  if (!perf) throw new Error(`unknown performance ${performanceId}`);
  const rows = alignSections(
    { sections: store.getSections(performanceId), lrc: perf.lrc, parts },
    threshold,
  );
  store.replaceSectionPartMap(performanceId, rows);
  return rows;
}
