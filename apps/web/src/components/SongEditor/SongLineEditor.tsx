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
    onChordDrop: (dataTransfer?: DataTransfer) => void;
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

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        // Only clear position when actually leaving the container,
        // not when entering a child element (segment)
        const relatedTarget = e.relatedTarget as Node | null;
        if (containerRef.current && relatedTarget && containerRef.current.contains(relatedTarget)) {
            // Moving to a child element, don't clear
            return;
        }
        setActiveSegmentIndex(null);
        onDropPositionChange(null);
    }, [onDropPositionChange]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onChordDrop(e.dataTransfer);
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

    const handleChordDragStartWrapper = (e: React.DragEvent, chordIndex: number, formattedChord: string, originalChord: string, originalCharIndex: number) => {
        setDraggingChordIndex(chordIndex);

        const chordData: DraggedChord = {
            chord: originalChord,
            source: 'line',
            originalPartIndex: partIndex,
            originalLineIndex: lineIndex,
            originalCharIndex: originalCharIndex,
        };

        // Store chord data in dataTransfer for reliable access during drop
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-chord', JSON.stringify(chordData));
        e.dataTransfer.setData('text/plain', originalChord);

        onChordDragStart(chordData);
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
                        totalSegments={segments.length}
                        draggingChordIndex={draggingChordIndex}
                        activeSegmentIndex={activeSegmentIndex}
                        isDropTarget={isDropTarget}
                        dropCharIndex={dropCharIndex}
                        isDragging={!!draggedChord}
                        lyricsLocked={lyricsLocked}
                        onTextChange={handleSegmentTextChange}
                        onNavigate={handleNavigate}
                        onChordDragStart={(e, chordIndex, display, originalChord, originalCharIndex) =>
                            handleChordDragStartWrapper(e, chordIndex, display, originalChord, originalCharIndex)
                        }
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
