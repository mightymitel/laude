import { useRef, useCallback, useState } from 'react';
import { Key, ChordStyle } from '@laudasist/shared';
import { DraggedChord } from './types';
import styles from './SongEditor.module.css';
import { useSongLineSegments } from '@/hooks/useSongLineSegments';
import { EditableSongSegment } from './EditableSongSegment';

interface SongLineEditorProps {
    lineText: string;
    partIndex: number;
    lineIndex: number;
    currentKey: Key;
    chordStyle: ChordStyle;
    lyricsLocked: boolean;
    draggedChord: DraggedChord | null;
    isDropTarget: boolean;
    dropCharIndex: number | null;
    onTextChange: (text: string) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onDropPositionChange: (charIndex: number | null) => void;
    onChordDrop: () => void;
    onChordDragStart: (chord: DraggedChord) => void;
    onChordDragEnd: () => void;
}

export function SongLineEditor({
    lineText,
    partIndex,
    lineIndex,
    currentKey,
    chordStyle,
    lyricsLocked,
    draggedChord,
    isDropTarget,
    dropCharIndex,
    onTextChange,
    onKeyDown,
    onDropPositionChange,
    onChordDrop,
    onChordDragStart,
    onChordDragEnd,
}: SongLineEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [draggingChordIndex, setDraggingChordIndex] = useState<number | null>(null);
    const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

    const { pureText, segments } = useSongLineSegments(lineText, currentKey, chordStyle);

    const handleSegmentHover = useCallback((segmentIndex: number, globalCharIndex: number | null) => {
        setActiveSegmentIndex(segmentIndex);
        onDropPositionChange(globalCharIndex);
    }, [onDropPositionChange]);

    const handleDragLeave = useCallback(() => {
        setActiveSegmentIndex(null);
        onDropPositionChange(null);
    }, [onDropPositionChange]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        onChordDrop();
        setDraggingChordIndex(null);
        setActiveSegmentIndex(null);
    }, [onChordDrop]);

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

    const handleChordDragStartWrapper = (chordIndex: number, formattedChord: string, originalChord: string, originalCharIndex: number) => {
        setDraggingChordIndex(chordIndex);
        onChordDragStart({
            chord: originalChord,
            source: 'line',
            originalPartIndex: partIndex,
            originalLineIndex: lineIndex,
            originalCharIndex: originalCharIndex,
        });
    };

    const handleNavigate = useCallback((index: number, dir: 'prev' | 'next') => {
        // Focus management placeholder
    }, []);

    return (
        <div
            ref={containerRef}
            className={styles.line}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragOver={(e) => {
                e.preventDefault(); // Necessary to allow dropping
                e.dataTransfer.dropEffect = 'move';
            }}
        >
            <div
                className={styles.visualLayer}
                style={{
                    pointerEvents: draggedChord ? 'auto' : 'auto'
                }}
            >
                {segments.map((seg, i) => (
                    <EditableSongSegment
                        key={i}
                        segment={seg}
                        segmentIndex={i}
                        draggingChordIndex={draggingChordIndex}
                        activeSegmentIndex={activeSegmentIndex}
                        isDropTarget={isDropTarget}
                        dropCharIndex={dropCharIndex}
                        isDragging={!!draggedChord}
                        lyricsLocked={lyricsLocked}
                        onTextChange={handleSegmentTextChange}
                        onNavigate={handleNavigate}
                        onChordDragStart={handleChordDragStartWrapper}
                        onChordDragEnd={() => {
                            setDraggingChordIndex(null);
                            onChordDragEnd();
                        }}
                        onHover={handleSegmentHover}
                    />
                ))}
            </div>
        </div>
    );
}
