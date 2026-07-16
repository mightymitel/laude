import { useCallback } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Key, ChordStyle } from '@laudasist/shared';
import styles from './SongEditor.module.css';
import { useSongLineSegments } from '@/hooks/useSongLineSegments';
import { EditableSongSegment } from './EditableSongSegment';
import { lineDroppableId } from './useChordDnd';

interface SongLineEditorProps {
    lineText: string;
    partIndex: number;
    lineIndex: number;
    currentKey: Key;
    chordStyle: ChordStyle;
    lyricsLocked: boolean;
    isDragging: boolean;
    isDropTarget: boolean;
    dropCharIndex: number | null;
    onTextChange: (text: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onDeleteLine: () => void;
}

/**
 * ONE droppable per lyric line (WP-166 / DEC-143): dnd-kit evaluates every
 * droppable per pointer move, so per-syllable targets would cliff on a
 * phone; the character-exact offset comes from caret-from-point instead.
 */
export function SongLineEditor({
    lineText,
    partIndex,
    lineIndex,
    currentKey,
    chordStyle,
    lyricsLocked,
    isDragging,
    isDropTarget,
    dropCharIndex,
    onTextChange,
    onKeyDown,
    onDeleteLine,
}: SongLineEditorProps) {
    const { setNodeRef } = useDroppable({ id: lineDroppableId(partIndex, lineIndex) });

    const { pureText, segments } = useSongLineSegments(lineText, currentKey, chordStyle);

    const handleSegmentTextChange = useCallback((segmentIndex: number, newSegmentText: string) => {
        let newLine = '';
        segments.forEach((seg, i) => {
            seg.chords.forEach(c => {
                newLine += `[${c.originalChord}]`;
            });
            const txt = (i === segmentIndex) ? newSegmentText : seg.text;
            newLine += txt;
        });
        onTextChange(newLine);
    }, [segments, onTextChange]);

    const handleNavigate = useCallback((_index: number, _dir: 'prev' | 'next') => {
        // Focus management placeholder
    }, []);

    return (
        <div
            ref={setNodeRef}
            className={styles.line}
            data-part-index={partIndex}
            data-line-index={lineIndex}
        >
            <div className={styles.visualLayer}>
                {segments.map((seg, i) => (
                    <EditableSongSegment
                        key={i}
                        segment={seg}
                        segmentIndex={i}
                        totalSegments={segments.length}
                        partIndex={partIndex}
                        lineIndex={lineIndex}
                        isDropTarget={isDropTarget}
                        dropCharIndex={dropCharIndex}
                        isDragging={isDragging}
                        lyricsLocked={lyricsLocked}
                        lineIsEmpty={pureText.trim() === '' && segments.length === 1 && seg.chords.length === 0}
                        onTextChange={handleSegmentTextChange}
                        onNavigate={handleNavigate}
                        onKeyDown={onKeyDown}
                        onDeleteLine={onDeleteLine}
                    />
                ))}
            </div>
        </div>
    );
}
