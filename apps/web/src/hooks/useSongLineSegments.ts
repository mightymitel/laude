import { useMemo } from 'react';
import { extractChordsFromLine, formatChord, Key, ChordStyle } from '@laudasist/shared';

export interface SegmentData {
    text: string;
    chords: SegmentChord[];
    startIndex: number;
}

export interface SegmentChord {
    index: number;
    display: string;
    originalChord: string;
    chordIndex: number;
}

export function useSongLineSegments(
    lineText: string,
    displayKey: Key,
    chordStyle: ChordStyle
): { pureText: string; segments: SegmentData[] } {

    const { text: pureText, chords } = useMemo(() => extractChordsFromLine(lineText), [lineText]);

    const segments = useMemo(() => {
        // Format all chords
        const formattedChords = chords.map((c, i) => ({
            index: c.index,
            display: formatChord(c.chord, displayKey, chordStyle),
            originalChord: formatChord(c.chord, displayKey, 'nashville'),
            chordIndex: i
        })).sort((a, b) => a.index - b.index);

        // Group by index
        const chordsByIndex = new Map<number, SegmentChord[]>();
        formattedChords.forEach(c => {
            if (!chordsByIndex.has(c.index)) {
                chordsByIndex.set(c.index, []);
            }
            chordsByIndex.get(c.index)?.push(c);
        });

        // Build Segments
        const segs: SegmentData[] = [];
        const chordIndices = Array.from(chordsByIndex.keys()).sort((a, b) => a - b);

        // Handle initial text if line doesn't start with a chord
        if (chordIndices.length > 0 && chordIndices[0] > 0) {
            segs.push({
                text: pureText.substring(0, chordIndices[0]),
                chords: [],
                startIndex: 0
            });
        } else if (formattedChords.length === 0 && pureText.length > 0) {
            segs.push({
                text: pureText,
                chords: [],
                startIndex: 0
            });
        } else if (formattedChords.length === 0 && pureText.length === 0) {
            // Empty line placeholder
            segs.push({ text: '', chords: [], startIndex: 0 });
        }

        // Create segments for each chord group
        chordIndices.forEach((index, i) => {
            const nextIndex = i < chordIndices.length - 1 ? chordIndices[i + 1] : pureText.length;
            const endIndex = Math.min(nextIndex, pureText.length);

            segs.push({
                text: pureText.substring(index, endIndex),
                chords: chordsByIndex.get(index) || [],
                startIndex: index
            });
        });

        return segs;
    }, [pureText, chords, displayKey, chordStyle]);

    return { pureText, segments };
}
