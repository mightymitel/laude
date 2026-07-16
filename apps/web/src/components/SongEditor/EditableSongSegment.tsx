import { useRef, useLayoutEffect, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { SegmentData, SegmentChord } from '@/hooks/useSongLineSegments';
import { DraggedChord } from './types';
import styles from './SongEditor.module.css';

interface EditableSongSegmentProps {
    segment: SegmentData;
    segmentIndex: number;
    totalSegments: number;
    partIndex: number;
    lineIndex: number;
    isDropTarget: boolean;
    dropCharIndex: number | null;
    isDragging: boolean;
    lyricsLocked: boolean;
    lineIsEmpty: boolean;
    onTextChange: (segmentIndex: number, newText: string) => void;
    onNavigate: (segmentIndex: number, direction: 'prev' | 'next') => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onDeleteLine: () => void;
}

/** A placed chord badge = a dnd-kit draggable carrying its origin (WP-166). */
function LineChordBadge({
    chord,
    partIndex,
    lineIndex,
}: {
    chord: SegmentChord;
    partIndex: number;
    lineIndex: number;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `line-chord:${partIndex}:${lineIndex}:${chord.chordIndex}`,
        data: {
            chord: chord.originalChord,
            source: 'line',
            originalPartIndex: partIndex,
            originalLineIndex: lineIndex,
            originalCharIndex: chord.index,
        } satisfies DraggedChord,
    });
    return (
        <span
            ref={setNodeRef}
            className={`${styles.chordBadge} ${isDragging ? styles.dragging : ''}`}
            {...attributes}
            {...listeners}
        >
            {chord.display}
        </span>
    );
}

export function EditableSongSegment({
    segment,
    segmentIndex,
    totalSegments,
    partIndex,
    lineIndex,
    isDropTarget,
    dropCharIndex,
    isDragging,
    lyricsLocked,
    lineIsEmpty,
    onTextChange,
    onNavigate,
    onKeyDown,
    onDeleteLine,
}: EditableSongSegmentProps) {
    const textRef = useRef<HTMLSpanElement>(null);
    const lastTextRef = useRef(segment.text);

    // Sync content if it changes externally
    useLayoutEffect(() => {
        if (textRef.current && textRef.current.innerText !== segment.text) {
            lastTextRef.current = segment.text;
            textRef.current.innerText = segment.text;
        }
    }, [segment.text]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLSpanElement>) => {
        const newText = e.currentTarget.innerText;
        if (newText !== segment.text) {
            onTextChange(segmentIndex, newText);
        }
    }, [segment.text, onTextChange, segmentIndex]);

    const handleInput = useCallback((e: React.FormEvent<HTMLSpanElement>) => {
        lastTextRef.current = e.currentTarget.innerText;
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (e.currentTarget.innerText !== segment.text) {
                onTextChange(segmentIndex, e.currentTarget.innerText);
            }
            onKeyDown(e);
        }

        if (e.key === 'Backspace') {
            const selection = window.getSelection();
            if (selection && selection.anchorOffset === 0) {
                const currentText = e.currentTarget.innerText;
                if (lineIsEmpty || (currentText === '' && segmentIndex === 0)) {
                    e.preventDefault();
                    onDeleteLine();
                    return;
                }
            }
        }

        if (e.key === 'ArrowLeft') {
            const selection = window.getSelection();
            if (selection && selection.anchorOffset === 0) {
                e.preventDefault();
                if (e.currentTarget.innerText !== segment.text) {
                    onTextChange(segmentIndex, e.currentTarget.innerText);
                }
                onNavigate(segmentIndex, 'prev');
            }
        }
        if (e.key === 'ArrowRight') {
            const selection = window.getSelection();
            if (selection && selection.anchorNode && selection.anchorOffset === (selection.anchorNode.textContent?.length || 0)) {
                e.preventDefault();
                if (e.currentTarget.innerText !== segment.text) {
                    onTextChange(segmentIndex, e.currentTarget.innerText);
                }
                onNavigate(segmentIndex, 'next');
            }
        }
    }, [onNavigate, segmentIndex, segment.text, onTextChange, onKeyDown, onDeleteLine, lineIsEmpty]);

    // The live landing preview (WP-166): a caret at the character-exact
    // insertion point, computed by the drag layer via caret-from-point.
    const localCaret =
        isDropTarget && dropCharIndex !== null
            ? dropCharIndex - segment.startIndex
            : null;
    const showCaret =
        localCaret !== null && localCaret >= 0 && localCaret <= segment.text.length &&
        // The caret belongs to exactly one segment: the one whose range
        // covers it (the last segment also owns its end position).
        (localCaret < segment.text.length || segmentIndex === totalSegments - 1);

    const caretElement = showCaret ? (
        <span className={styles.dropCaret} style={{ left: `${localCaret}ch` }} />
    ) : null;

    return (
        <div
            className={styles.segment}
            data-start-index={segment.startIndex}
            data-segment-index={segmentIndex}
        >
            <div
                className={styles.segmentChords}
                style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
            >
                {segment.chords.map((c) => (
                    <LineChordBadge key={c.chordIndex} chord={c} partIndex={partIndex} lineIndex={lineIndex} />
                ))}
            </div>

            <div className={styles.visualTextWrapper}>
                <span
                    ref={textRef}
                    className={`${styles.segmentText} ${!segment.text && totalSegments === 1 && segment.chords.length === 0 ? styles.emptyPlaceholder : ''}`}
                    contentEditable={!lyricsLocked}
                    suppressContentEditableWarning
                    onBlur={handleBlur}
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                    data-placeholder="Type lyrics here..."
                >
                    {segment.text}
                </span>
                {caretElement}
            </div>
        </div>
    );
}
