/**
 * Thin hook over the shared rendering core (WP-165): the segment shape the
 * song view / session overview / editor consume. The layout math lives in
 * rendering/core.ts — characterized by the WP-164 goldens.
 */
import { useMemo } from 'react';
import type { Key, ChordStyle } from '@laudasist/shared';
import { lineToSegments, type SegmentShape, type SegmentChordShape } from '@/rendering/core';

export type SegmentData = SegmentShape;
export type SegmentChord = SegmentChordShape;

export function useSongLineSegments(
    lineText: string,
    displayKey: Key,
    chordStyle: ChordStyle,
): { pureText: string; segments: SegmentData[] } {
    return useMemo(
        () => lineToSegments(lineText, displayKey, chordStyle),
        [lineText, displayKey, chordStyle],
    );
}
