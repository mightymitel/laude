/**
 * Chord drag & drop on dnd-kit (WP-166 / DEC-143). Transport only — the
 * line mutations are the same chordLineOps as before. Design constraints:
 *  - ONE droppable per lyric LINE (per-syllable droppables would put ~1.2k
 *    droppables on a 40-line song — dnd-kit's perf cliff); the char offset
 *    comes from caret-from-point at the pointer's position.
 *  - The drop indicator previews the ACTUAL landing position live.
 *  - A loupe floats above COARSE (touch) pointers; never for mouse, never
 *    when the editor font is already large.
 */
import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { Song, Key, ChordStyle, extractChordsFromLine, formatChord, parseNashville } from '@laudasist/shared';
import { DraggedChord, DropPosition } from './types';
import { rebuildLineWithChords, removeChordFromLine, toNashvilleChord, withoutChordAt } from './chordLineOps';
import { charIndexFromPoint } from './caretFromPoint';
import type { LoupeState } from './ChordLoupe';

export const DELETE_ZONE_ID = 'chord-delete-zone';

export function lineDroppableId(partIndex: number, lineIndex: number): string {
    return `line-drop:${partIndex}:${lineIndex}`;
}

function parseLineDroppableId(id: string): { partIndex: number; lineIndex: number } | null {
    const m = /^line-drop:(\d+):(\d+)$/.exec(id);
    return m ? { partIndex: Number(m[1]), lineIndex: Number(m[2]) } : null;
}

/** Pointer viewport coords during a dnd-kit drag: activator + delta. */
function pointerOf(event: DragMoveEvent | DragEndEvent): { x: number; y: number } | null {
    const activator = event.activatorEvent;
    if (!(activator instanceof PointerEvent) && !(activator instanceof MouseEvent)) return null;
    return { x: activator.clientX + event.delta.x, y: activator.clientY + event.delta.y };
}

function isCoarsePointer(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

interface UseChordDndArgs {
    currentKey: Key;
    chordStyle: ChordStyle;
    setEditingSong: Dispatch<SetStateAction<Partial<Song>>>;
}

export function useChordDnd({ currentKey, chordStyle, setEditingSong }: UseChordDndArgs) {
    const [draggedChord, setDraggedChord] = useState<DraggedChord | null>(null);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
    const [loupe, setLoupe] = useState<LoupeState | null>(null);
    const [customChords, setCustomChords] = useState<string[]>([]);

    // Immediate-feeling drag on touch AND mouse; 3px distinguishes taps.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 3 } }));

    // The drag layer needs to READ the current song during a move without
    // making onDragMove depend on the whole editing state (would re-create
    // the handler per keystroke): a peek ref updated by the editor.
    const setEditingSongPeek = useMemo(() => ({ current: null as Partial<Song> | null }), []);

    const displayOf = useCallback(
        (chord: string) =>
            formatChord(parseNashville(chord) || { degree: 1, quality: '' }, currentKey, chordStyle),
        [currentKey, chordStyle],
    );

    // --- mutations (unchanged semantics from the pre-dnd-kit editor) ---

    const applyChordDrop = useCallback(
        (dropped: DraggedChord, position: DropPosition) => {
            setEditingSong((prev) => {
                const parts = [...(prev.parts || [])];
                const targetPart = parts[position.partIndex];
                if (!targetPart) return prev;
                const targetLines = [...targetPart.lines];
                const targetLine = targetLines[position.lineIndex];
                if (!targetLine) return prev;

                const { text: targetPureText, chords: existingChords } = extractChordsFromLine(targetLine.text);

                let chordsToKeep = existingChords;
                if (
                    dropped.source === 'line' &&
                    dropped.originalPartIndex === position.partIndex &&
                    dropped.originalLineIndex === position.lineIndex &&
                    dropped.originalCharIndex !== undefined
                ) {
                    chordsToKeep = withoutChordAt(existingChords, dropped.originalCharIndex, dropped.chord, currentKey);
                }

                const newChord = { index: position.charIndex, chord: toNashvilleChord(dropped.chord) };
                const allChords = [...chordsToKeep, newChord].sort((a, b) => a.index - b.index);
                targetLines[position.lineIndex] = { text: rebuildLineWithChords(targetPureText, allChords, currentKey) };
                parts[position.partIndex] = { ...targetPart, lines: targetLines };

                if (
                    dropped.source === 'line' &&
                    dropped.originalLineIndex !== undefined &&
                    dropped.originalCharIndex !== undefined &&
                    (dropped.originalLineIndex !== position.lineIndex ||
                        dropped.originalPartIndex !== position.partIndex)
                ) {
                    const sourcePartIndex = dropped.originalPartIndex ?? position.partIndex;
                    const sourcePart = parts[sourcePartIndex];
                    if (sourcePart) {
                        const sourceLines = [...sourcePart.lines];
                        const sourceLine = sourceLines[dropped.originalLineIndex];
                        if (sourceLine) {
                            sourceLines[dropped.originalLineIndex] = {
                                text: removeChordFromLine(
                                    sourceLine.text,
                                    dropped.originalCharIndex,
                                    dropped.chord,
                                    currentKey,
                                ),
                            };
                            parts[sourcePartIndex] = { ...sourcePart, lines: sourceLines };
                        }
                    }
                }
                return { ...prev, parts };
            });
        },
        [currentKey, setEditingSong],
    );

    const removeLineChord = useCallback(
        (chord: DraggedChord) => {
            if (
                chord.source !== 'line' ||
                chord.originalPartIndex === undefined ||
                chord.originalLineIndex === undefined ||
                chord.originalCharIndex === undefined
            ) {
                return;
            }
            const { chord: chordStr, originalPartIndex, originalLineIndex, originalCharIndex } = chord;
            setEditingSong((prev) => {
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
        },
        [currentKey, setEditingSong],
    );

    // --- dnd-kit event wiring ---

    const onDragStart = useCallback((event: DragStartEvent) => {
        const data = event.active.data.current;
        if (data && typeof data === 'object' && 'chord' in data) {
            setDraggedChord(data as DraggedChord);
        }
    }, []);

    const onDragMove = useCallback(
        (event: DragMoveEvent) => {
            if (!draggedChord) return;
            const overId = event.over?.id;
            const lineRef = typeof overId === 'string' ? parseLineDroppableId(overId) : null;
            const pointer = pointerOf(event);
            if (!lineRef || !pointer) {
                setDropPosition(null);
                setLoupe(null);
                return;
            }
            const lineEl = document.querySelector<HTMLElement>(
                `[data-part-index="${lineRef.partIndex}"][data-line-index="${lineRef.lineIndex}"]`,
            );
            if (!lineEl) return;
            const charIndex = charIndexFromPoint(lineEl, pointer.x, pointer.y);
            if (charIndex === null) {
                setDropPosition(null);
                setLoupe(null);
                return;
            }
            setDropPosition({ partIndex: lineRef.partIndex, lineIndex: lineRef.lineIndex, charIndex });
            // Loupe: coarse pointers only, and only when the finger occludes
            // small text (editor base font < ~24px per the Magnifier spec).
            const fontPx = parseFloat(getComputedStyle(lineEl).fontSize || '16');
            if (isCoarsePointer() && fontPx < 24) {
                const lineText =
                    (setEditingSongPeek.current?.parts?.[lineRef.partIndex]?.lines[lineRef.lineIndex]?.text) ?? '';
                setLoupe({
                    x: pointer.x,
                    y: pointer.y,
                    lineText,
                    caretIndex: charIndex,
                    chordDisplay: displayOf(draggedChord.chord),
                });
            }
        },
        [draggedChord, displayOf, setEditingSongPeek],
    );

    const onDragEnd = useCallback(
        (event: DragEndEvent) => {
            const chord = draggedChord;
            const overId = event.over?.id;
            setDraggedChord(null);
            setLoupe(null);
            const finalPosition = dropPosition;
            setDropPosition(null);
            if (!chord) return;
            if (overId === DELETE_ZONE_ID) {
                removeLineChord(chord);
                return;
            }
            const lineRef = typeof overId === 'string' ? parseLineDroppableId(overId) : null;
            if (lineRef && finalPosition && finalPosition.partIndex === lineRef.partIndex && finalPosition.lineIndex === lineRef.lineIndex) {
                applyChordDrop(chord, finalPosition);
            }
        },
        [draggedChord, dropPosition, applyChordDrop, removeLineChord],
    );

    const onDragCancel = useCallback(() => {
        setDraggedChord(null);
        setDropPosition(null);
        setLoupe(null);
    }, []);

    const handleAddCustomChord = useCallback((chord: string) => {
        setCustomChords((prev) => [...prev, chord]);
    }, []);

    return {
        sensors,
        onDragStart,
        onDragMove,
        onDragEnd,
        onDragCancel,
        draggedChord,
        dropPosition,
        loupe,
        customChords,
        handleAddCustomChord,
        displayOf,
        /** Keep current in the editor so onDragMove can read line text. */
        editingSongPeek: setEditingSongPeek,
    };
}
