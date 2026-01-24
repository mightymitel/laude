import { useRef, useLayoutEffect, useCallback } from 'react';
import { SegmentData } from '@/hooks/useSongLineSegments';
import styles from './SongEditor.module.css';

interface EditableSongSegmentProps {
    segment: SegmentData;
    segmentIndex: number;
    draggingChordIndex: number | null;
    activeSegmentIndex: number | null;
    isDropTarget: boolean;
    dropCharIndex: number | null;
    isDragging: boolean;
    lyricsLocked: boolean;
    onTextChange: (segmentIndex: number, newText: string) => void;
    onNavigate: (segmentIndex: number, direction: 'prev' | 'next') => void;
    onChordDragStart: (chordIndex: number, display: string, originalChord: string, originalCharIndex: number) => void;
    onChordDragEnd: () => void;
    // New prop for signaling hover position
    onHover: (segmentIndex: number, charIndex: number | null) => void;
}

export function EditableSongSegment({
    segment,
    segmentIndex,
    draggingChordIndex,
    activeSegmentIndex,
    isDropTarget,
    dropCharIndex,
    isDragging,
    lyricsLocked,
    onTextChange,
    onNavigate,
    onChordDragStart,
    onChordDragEnd,
    onHover
}: EditableSongSegmentProps) {
    const textRef = useRef<HTMLSpanElement>(null);
    const lastTextRef = useRef(segment.text);

    // ... (sync effect matches existing)

    const handleDragOver = useCallback((e: React.DragEvent) => {
        // Stop bubbling so parent doesn't try to handle it
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        if (textRef.current) {
            const textRect = textRef.current.getBoundingClientRect();
            const textContent = segment.text || '';

            let offset = 0;
            if (textContent.length > 0) {
                const charWidth = textRect.width / textContent.length;
                const relX = e.clientX - textRect.left;
                offset = Math.round(relX / charWidth);
                offset = Math.max(0, Math.min(offset, textContent.length));
            }

            onHover(segmentIndex, segment.startIndex + offset);
        }
    }, [segment.text, segment.startIndex, segmentIndex, onHover]);

    // Sync content if it changes externally
    useLayoutEffect(() => {
        if (textRef.current && textRef.current.innerText !== segment.text) {
            lastTextRef.current = segment.text;
            textRef.current.innerText = segment.text;
        }
    }, [segment.text]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLSpanElement>) => {
        const newText = e.currentTarget.innerText;
        // Only commit if text actually changed from what we started with/synced
        if (newText !== segment.text) {
            onTextChange(segmentIndex, newText);
        }
    }, [segment.text, onTextChange, segmentIndex]);

    const handleInput = useCallback((e: React.FormEvent<HTMLSpanElement>) => {
        const component = e.currentTarget;
        const newText = component.innerText;
        // Just track it, don't commit yet
        lastTextRef.current = newText;
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
        }

        if (e.key === 'ArrowLeft') {
            const selection = window.getSelection();
            if (selection && selection.anchorOffset === 0) {
                e.preventDefault();
                // Commit before navigating!
                if (e.currentTarget.innerText !== segment.text) {
                    onTextChange(segmentIndex, e.currentTarget.innerText);
                }
                onNavigate(segmentIndex, 'prev');
            }
        }
        if (e.key === 'ArrowRight') {
            const selection = window.getSelection();
            // Check if at end
            if (selection && selection.anchorNode && selection.anchorOffset === (selection.anchorNode.textContent?.length || 0)) {
                e.preventDefault();
                // Commit before navigating
                if (e.currentTarget.innerText !== segment.text) {
                    onTextChange(segmentIndex, e.currentTarget.innerText);
                }
                onNavigate(segmentIndex, 'next');
            }
        }
    }, [onNavigate, segmentIndex, segment.text, onTextChange]);

    // Draw the caret manually if valid drop target
    const showCaret = isDropTarget &&
        dropCharIndex !== null &&
        activeSegmentIndex === segmentIndex;

    const caretElement = showCaret ? (
        <span
            className={styles.dropCaret}
            style={{ left: `${dropCharIndex! - segment.startIndex}ch` }}
        />
    ) : null;

    return (
        <div
            className={styles.segment}
            data-start-index={segment.startIndex}
            data-segment-index={segmentIndex}
            onDragOver={handleDragOver}
        >
            <div
                className={styles.segmentChords}
                style={{
                    pointerEvents: isDragging ? 'none' : 'auto'
                }}
            >
                {segment.chords.map((c) => (
                    <span
                        key={c.chordIndex}
                        className={`${styles.chordBadge} ${draggingChordIndex === c.chordIndex ? styles.dragging : ''}`}
                        draggable
                        onDragStart={(e) => {
                            e.stopPropagation();
                            onChordDragStart(c.chordIndex, c.display, c.originalChord, c.index);
                        }}
                        onDragEnd={onChordDragEnd}
                    >
                        {c.display}
                    </span>
                ))}
            </div>

            <div className={styles.visualTextWrapper}>
                <span
                    ref={textRef}
                    className={styles.segmentText}
                    contentEditable={!lyricsLocked}
                    suppressContentEditableWarning
                    onBlur={handleBlur}
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    spellCheck={false}
                >
                    {segment.text}
                </span>
                {caretElement}
            </div>
        </div>
    );
}
