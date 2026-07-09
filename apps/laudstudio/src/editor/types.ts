/**
 * LaudStudio interpretation editor — TYPES ONLY (seam).
 * The editor UI + apply logic get their own specced session; these types pin
 * down the edit vocabulary from the Architecture spec: "split/trim/rename
 * parts, part variations, grid/section/chord fixes". Every operation targets
 * a performance in the local store and is undoable by design (op log).
 */
import type { ChordEvent } from '@laude/song-model';

/** Split one section at a time offset into two. */
export interface SplitSectionOp {
  kind: 'split_section';
  performance_id: string;
  section_index: number;
  at_s: number;
}

/** Merge a section with the one after it. */
export interface MergeSectionsOp {
  kind: 'merge_sections';
  performance_id: string;
  section_index: number;
}

/** Rename a section label (Verse 2 → Chorus …). */
export interface RenameSectionOp {
  kind: 'rename_section';
  performance_id: string;
  section_index: number;
  label: string;
}

/** Trim the performance's start/end within the source video. */
export interface TrimPerformanceOp {
  kind: 'trim_performance';
  performance_id: string;
  start_s: number;
  end_s: number;
}

/** Mark a section as a variation of another (Chorus 2 = Chorus + drop). */
export interface SectionVariationOp {
  kind: 'section_variation';
  performance_id: string;
  section_index: number;
  variation_of_index: number;
  variation_label: string;
}

/** Move every beat by a constant offset (grid phase fix). */
export interface ShiftBeatgridOp {
  kind: 'shift_beatgrid';
  performance_id: string;
  offset_s: number;
}

/** Re-time one section's boundaries (bar-snapped by the apply logic). */
export interface RetimeSectionOp {
  kind: 'retime_section';
  performance_id: string;
  section_index: number;
  start_s: number;
  end_s: number;
}

/** Replace the chord events in a time range (chord fix). */
export interface ReplaceChordsOp {
  kind: 'replace_chords';
  performance_id: string;
  from_s: number;
  to_s: number;
  events: ChordEvent[];
}

/** Correct one LRC line's text and/or timing (lyric fix). */
export interface FixLyricLineOp {
  kind: 'fix_lyric_line';
  performance_id: string;
  line_index: number;
  text?: string;
  time_s?: number;
}

export type EditOperation =
  | SplitSectionOp
  | MergeSectionsOp
  | RenameSectionOp
  | TrimPerformanceOp
  | SectionVariationOp
  | ShiftBeatgridOp
  | RetimeSectionOp
  | ReplaceChordsOp
  | FixLyricLineOp;

/** Applying any edit marks the touched artifacts verified=true-able: a human
 * touched them — the curation gate rides the editor, not a separate page. */
export interface EditResult {
  applied: EditOperation;
  /** Artifacts invalidated by the edit (need re-render/re-export). */
  invalidates: ('sections' | 'beatgrid' | 'chords' | 'lrc' | 'audio_variants')[];
}
