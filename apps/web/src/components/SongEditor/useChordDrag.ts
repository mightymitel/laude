import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import {
    Song, Key, ChordStyle,
    extractChordsFromLine, formatChord, parseNashville,
} from '@laudasist/shared';
import { DraggedChord, DropPosition } from './types';
import { useTouchDrag } from '@/hooks/useTouchDrag';
import { rebuildLineWithChords, removeChordFromLine, toNashvilleChord, withoutChordAt } from './chordLineOps';
import { getTouchDropPosition, getTouchDropTargetPosition } from './chordDropDom';

interface UseChordDragArgs {
    currentKey: Key;
    chordStyle: ChordStyle;
    setEditingSong: Dispatch<SetStateAction<Partial<Song>>>;
}

/**
 * Chord palette + drag & drop state for the song editor: mouse and touch
 * dragging, drop-position tracking, dropping chords onto lines, and the
 * delete drop zone.
 */
export function useChordDrag({ currentKey, chordStyle, setEditingSong }: UseChordDragArgs) {
    const [draggedChord, setDraggedChord] = useState<DraggedChord | null>(null);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
    const [customChords, setCustomChords] = useState<string[]>([]);

    // Touch drag state
    const [touchDragPosition, setTouchDragPosition] = useState<{ x: number; y: number } | null>(null);
    const [touchDragChordDisplay, setTouchDragChordDisplay] = useState<string | null>(null);

    const handleChordDrop = useCallback((position: DropPosition, dataTransfer?: DataTransfer) => {
        // Try to get chord from state first, then fall back to dataTransfer
        let chord = draggedChord;
        if (!chord && dataTransfer) {
            try {
                const chordData = dataTransfer.getData('application/x-chord');
                if (chordData) {
                    const parsed: DraggedChord = JSON.parse(chordData);
                    chord = parsed;
                }
            } catch {
                // Try plain text fallback
                const plainChord = dataTransfer.getData('text/plain');
                if (plainChord) {
                    chord = { chord: plainChord, source: 'toolbar' };
                }
            }
        }

        if (!chord) return;
        const dropped = chord;

        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const targetPart = parts[position.partIndex];
            if (!targetPart) return prev;

            const targetLines = [...targetPart.lines];
            const targetLine = targetLines[position.lineIndex];
            if (!targetLine) return prev;

            // Extract pure text and existing chords from target line
            const { text: targetPureText, chords: existingChords } = extractChordsFromLine(targetLine.text);

            // Step 1: Remove chord from original position if moving within same line
            let chordsToKeep = existingChords;
            if (dropped.source === 'line' &&
                dropped.originalLineIndex === position.lineIndex &&
                dropped.originalCharIndex !== undefined) {

                chordsToKeep = withoutChordAt(existingChords, dropped.originalCharIndex, dropped.chord, currentKey);
            }

            // Step 2: Add the new chord at drop position
            const newChord = { index: position.charIndex, chord: toNashvilleChord(dropped.chord) };
            const allChords = [...chordsToKeep, newChord].sort((a, b) => a.index - b.index);

            // Step 3: Rebuild the line text with chords in correct positions
            targetLines[position.lineIndex] = { text: rebuildLineWithChords(targetPureText, allChords, currentKey) };
            parts[position.partIndex] = { ...targetPart, lines: targetLines };

            // Step 4: Remove from original line if it was from a different line or part
            if (dropped.source === 'line' &&
                dropped.originalLineIndex !== undefined &&
                dropped.originalCharIndex !== undefined &&
                (dropped.originalLineIndex !== position.lineIndex ||
                    dropped.originalPartIndex !== position.partIndex)) {

                const sourcePartIndex = dropped.originalPartIndex ?? position.partIndex;
                const sourcePart = parts[sourcePartIndex];
                if (sourcePart) {
                    const sourceLines = [...sourcePart.lines];
                    const sourceLine = sourceLines[dropped.originalLineIndex];

                    if (sourceLine) {
                        sourceLines[dropped.originalLineIndex] = {
                            text: removeChordFromLine(sourceLine.text, dropped.originalCharIndex, dropped.chord, currentKey),
                        };
                        parts[sourcePartIndex] = { ...sourcePart, lines: sourceLines };
                    }
                }
            }

            return { ...prev, parts };
        });

        setDraggedChord(null);
        setDropPosition(null);
    }, [draggedChord, currentKey, setEditingSong]);

    // Touch drag hook
    const touchDrag = useTouchDrag<DraggedChord>({
        onDragStart: (chord) => {
            setDraggedChord(chord);
            // Format chord for display
            const display = formatChord(parseNashville(chord.chord) || { degree: 1, quality: '' }, currentKey, chordStyle);
            setTouchDragChordDisplay(display);
        },
        onDragEnd: () => {
            setDraggedChord(null);
            setDropPosition(null);
            setTouchDragPosition(null);
            setTouchDragChordDisplay(null);
        },
        onDrop: (_chord, targetElement) => {
            if (!targetElement) return;

            const position = getTouchDropTargetPosition(targetElement, touchDrag.position?.x || 0);
            if (position) {
                handleChordDrop(position);
            }
            // Drops on the delete zone are handled by the zone's own onDrop.
        },
    });

    // Update touch drag position for indicator and calculate drop position
    if (touchDrag.position && touchDrag.position !== touchDragPosition) {
        setTouchDragPosition(touchDrag.position);

        // Calculate drop position from touch coordinates
        if (touchDrag.isDragging) {
            const position = getTouchDropPosition(touchDrag.position.x, touchDrag.position.y);
            if (position) {
                setDropPosition(position);
            }
        }
    }

    // Handler for starting touch drag on a chord
    const handleTouchDragStart = useCallback((chord: DraggedChord, e: React.TouchEvent) => {
        const touch = e.touches[0];
        if (touch) {
            touchDrag.startDrag(chord, touch);
        }
    }, [touchDrag]);

    const handleAddCustomChord = useCallback((chord: string) => {
        setCustomChords(prev => [...prev, chord]);
    }, []);

    // Chord drag handlers
    const handleChordDragStart = useCallback((chord: DraggedChord) => {
        setDraggedChord(chord);
    }, []);

    const handleChordDragEnd = useCallback(() => {
        setDraggedChord(null);
        setDropPosition(null);
    }, []);

    const handleDropPositionChange = useCallback((position: DropPosition | null) => {
        setDropPosition(position);
    }, []);

    // Drop handler for the delete zone: removes a line chord dragged onto it
    const handleDeleteZoneDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Try to get chord from state first, then fall back to dataTransfer
        let chord = draggedChord;
        if (!chord) {
            try {
                const chordData = e.dataTransfer.getData('application/x-chord');
                if (chordData) {
                    const parsed: DraggedChord = JSON.parse(chordData);
                    chord = parsed;
                }
            } catch {
                // Ignore parse errors
            }
        }

        // Remove chord from original position (only for line chords)
        if (chord?.source === 'line' &&
            chord.originalPartIndex !== undefined &&
            chord.originalLineIndex !== undefined &&
            chord.originalCharIndex !== undefined) {

            const { chord: chordStr, originalPartIndex, originalLineIndex, originalCharIndex } = chord;

            setEditingSong(prev => {
                const parts = [...(prev.parts || [])];
                const part = parts[originalPartIndex];
                if (!part) return prev;

                const lines = [...part.lines];
                const line = lines[originalLineIndex];
                if (!line) return prev;

                lines[originalLineIndex] = {
                    text: removeChordFromLine(line.text, originalCharIndex, chordStr, currentKey),
                };
                parts[originalPartIndex] = { ...part, lines };

                return { ...prev, parts };
            });
        }

        setDraggedChord(null);
        setDropPosition(null);
    }, [draggedChord, currentKey, setEditingSong]);

    return {
        draggedChord,
        dropPosition,
        customChords,
        isTouchDragging: touchDrag.isDragging,
        touchDragPosition,
        touchDragChordDisplay,
        handleTouchDragStart,
        handleAddCustomChord,
        handleChordDragStart,
        handleChordDragEnd,
        handleDropPositionChange,
        handleChordDrop,
        handleDeleteZoneDrop,
    };
}
