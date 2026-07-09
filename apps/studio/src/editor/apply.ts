/**
 * Interpretation editor — apply logic (WP-104). "Interpretation ALWAYS":
 * sections, grid, chord events and LRC belong to the local performance and
 * stay editable regardless of link state (the chart is the only pane that
 * locks — see ./chart).
 */
import type { LrcLine } from '@laude/song-model';
import { alignPerformance } from '../service/align';
import type { LocalStore, SectionRow } from '../store';
import type { EditOperation, EditResult } from './types';

function sectionsOf(store: LocalStore, performanceId: string): SectionRow[] {
  const rows = store.getSections(performanceId);
  if (rows.length === 0) throw new Error(`performance ${performanceId} has no sections`);
  return rows;
}

/** Structural section edits invalidate the mapping; the auto-matcher re-runs
 * (DEC-56/63 — autosync needs no stored correspondence). Human review of the
 * fresh proposals happens in the mapping panel. */
function realign(store: LocalStore, performanceId: string): void {
  const perf = store.getPerformance(performanceId);
  if (!perf) return;
  const song = store.getLocalSong(perf.local_song_id);
  if (song?.snapshot_parts) alignPerformance(store, performanceId, song.snapshot_parts.parts);
}

function requireIndex<T>(rows: T[], index: number, what: string): T {
  const row = rows[index];
  if (row === undefined) throw new Error(`${what} ${index} out of range (0..${rows.length - 1})`);
  return row;
}

/** Recompute 1-based ordinals after any structural change. */
function withOrdinals(rows: SectionRow[]): SectionRow[] {
  const counts = new Map<string, number>();
  return rows.map((r) => {
    const ordinal = (counts.get(r.label) ?? 0) + 1;
    counts.set(r.label, ordinal);
    return { ...r, ordinal };
  });
}

export function applyEdit(store: LocalStore, op: EditOperation): EditResult {
  switch (op.kind) {
    case 'rename_section': {
      const rows = sectionsOf(store, op.performance_id);
      requireIndex(rows, op.section_index, 'section');
      const next = withOrdinals(
        rows.map((r, i) => (i === op.section_index ? { ...r, label: op.label } : r)),
      );
      store.replaceSections(op.performance_id, next);
      realign(store, op.performance_id);
      return { applied: op, invalidates: ['sections'] };
    }
    case 'split_section': {
      const rows = sectionsOf(store, op.performance_id);
      const target = requireIndex(rows, op.section_index, 'section');
      if (op.at_s <= target.start_s || op.at_s >= target.end_s) {
        throw new Error(`split point ${op.at_s}s outside section (${target.start_s}–${target.end_s}s)`);
      }
      const grid = store.getBeatgrid(op.performance_id);
      const barAt = (t: number): number => {
        if (!grid || grid.beats.length === 0) return target.start_bar;
        const idx = grid.beats.findIndex((b) => b >= t);
        return Math.floor((idx === -1 ? grid.beats.length : idx) / 4);
      };
      const first: SectionRow = { ...target, end_s: op.at_s, end_bar: barAt(op.at_s) };
      const second: SectionRow = {
        ...target,
        id: `${target.id}-b`,
        start_s: op.at_s,
        start_bar: barAt(op.at_s),
      };
      const next = withOrdinals(rows.flatMap((r, i) => (i === op.section_index ? [first, second] : [r])));
      store.replaceSections(op.performance_id, next);
      realign(store, op.performance_id);
      return { applied: op, invalidates: ['sections'] };
    }
    case 'merge_sections': {
      const rows = sectionsOf(store, op.performance_id);
      const a = requireIndex(rows, op.section_index, 'section');
      const b = requireIndex(rows, op.section_index + 1, 'section');
      const merged: SectionRow = { ...a, end_s: b.end_s, end_bar: b.end_bar };
      const next = withOrdinals(
        rows.flatMap((r, i) => (i === op.section_index ? [merged] : i === op.section_index + 1 ? [] : [r])),
      );
      store.replaceSections(op.performance_id, next);
      realign(store, op.performance_id);
      return { applied: op, invalidates: ['sections'] };
    }
    case 'retime_section': {
      const rows = sectionsOf(store, op.performance_id);
      requireIndex(rows, op.section_index, 'section');
      if (op.end_s <= op.start_s) throw new Error('end_s must be after start_s');
      const next = withOrdinals(
        rows.map((r, i) =>
          i === op.section_index ? { ...r, start_s: op.start_s, end_s: op.end_s } : r,
        ),
      );
      store.replaceSections(op.performance_id, next);
      realign(store, op.performance_id);
      return { applied: op, invalidates: ['sections'] };
    }
    case 'section_variation': {
      const rows = sectionsOf(store, op.performance_id);
      requireIndex(rows, op.section_index, 'section');
      const of = requireIndex(rows, op.variation_of_index, 'section');
      const next = withOrdinals(
        rows.map((r, i) =>
          i === op.section_index ? { ...r, label: op.variation_label, variation_of: of.id } : r,
        ),
      );
      store.replaceSections(op.performance_id, next);
      realign(store, op.performance_id);
      return { applied: op, invalidates: ['sections'] };
    }
    case 'trim_performance': {
      const perf = store.getPerformance(op.performance_id);
      if (!perf) throw new Error(`unknown performance ${op.performance_id}`);
      if (op.end_s <= op.start_s) throw new Error('end_s must be after start_s');
      store.upsertPerformance({ ...perf, start_s: op.start_s, end_s: op.end_s });
      return { applied: op, invalidates: ['sections', 'beatgrid', 'audio_variants'] };
    }
    case 'shift_beatgrid': {
      const grid = store.getBeatgrid(op.performance_id);
      if (!grid) throw new Error(`performance ${op.performance_id} has no beat grid`);
      store.setBeatgrid(
        op.performance_id,
        grid.bpm,
        grid.beats.map((b) => Math.round((b + op.offset_s) * 1000) / 1000),
        grid.downbeats,
      );
      return { applied: op, invalidates: ['beatgrid'] };
    }
    case 'replace_chords': {
      const events = store.getChordEvents(op.performance_id);
      const kept = events.filter((e) => e.start_s < op.from_s || e.start_s >= op.to_s);
      const next = [...kept, ...op.events].sort((a, b) => a.start_s - b.start_s);
      // A human touched them: chord events are verified from here on.
      store.setChordEvents(op.performance_id, next, true);
      return { applied: op, invalidates: ['chords'] };
    }
    case 'fix_lyric_line': {
      const perf = store.getPerformance(op.performance_id);
      if (!perf) throw new Error(`unknown performance ${op.performance_id}`);
      const lrc: LrcLine[] = perf.lrc.map((line, i) =>
        i === op.line_index
          ? {
              ...line,
              ...(op.text !== undefined ? { text: op.text } : {}),
              ...(op.time_s !== undefined ? { time_s: op.time_s } : {}),
            }
          : line,
      );
      if (op.line_index < 0 || op.line_index >= perf.lrc.length) {
        throw new Error(`lyric line ${op.line_index} out of range`);
      }
      store.upsertPerformance({ ...perf, lrc });
      return { applied: op, invalidates: ['lrc'] };
    }
  }
}
