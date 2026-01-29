import { useState, useCallback, useMemo, useRef } from 'react';
import {
    Song, SongPart, Key, ChordStyle, PartType,
    formatChord, parseNashville, extractChordsFromLine
} from '@laudasist/shared';
import { SongEditorProps, DraggedChord, DropPosition } from './types';
import { SongEditorToolbar } from './SongEditorToolbar';
import { SongPartEditor } from './SongPartEditor';
import { SongRawEditor } from './SongRawEditor';
import { PartManager } from './PartManager';
import { ArrangementPanel } from './ArrangementPanel';
import { DragIndicator } from './DragIndicator';
import { useTouchDrag } from '@/hooks/useTouchDrag';
import styles from './SongEditor.module.css';

const KEYS: Key[] = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

function createEmptySong(): Partial<Song> {
    return {
        title: '',
        author: '',
        originalKey: 'C',
        parts: [],
        tags: [],
        defaultArrangement: [],
        arrangements: [],
    };
}

function generatePartId(type: PartType, existingParts: SongPart[]): string {
    const count = existingParts.filter(p => p.type === type).length;
    const prefix = type === 'verse' ? 'V' :
        type === 'chorus' ? 'C' :
            type === 'bridge' ? 'B' :
                type === 'pre-chorus' ? 'PC' :
                    type === 'intro' ? 'I' :
                        type === 'outro' ? 'O' : 'T';
    return `${prefix}${count + 1}`;
}

/**
 * Auto-split parts that have 3+ consecutive empty lines
 * Returns the updated parts array
 */
function autoSplitParts(parts: SongPart[]): SongPart[] {
    const result: SongPart[] = [];

    for (const part of parts) {
        const lines = part.lines;
        const segments: { start: number; end: number }[] = [];
        let segmentStart = 0;
        let emptyCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const isEmpty = !lines[i]?.text.trim();

            if (isEmpty) {
                emptyCount++;
            } else {
                // If we had 3+ empty lines, split here
                if (emptyCount >= 3) {
                    // End previous segment before the empty lines
                    const segmentEnd = i - emptyCount;
                    if (segmentEnd > segmentStart) {
                        segments.push({ start: segmentStart, end: segmentEnd });
                    }
                    // Start new segment after empty lines
                    segmentStart = i;
                }
                emptyCount = 0;
            }
        }

        // Add final segment if not empty
        const finalEnd = lines.length - emptyCount;
        if (finalEnd > segmentStart) {
            segments.push({ start: segmentStart, end: finalEnd });
        }

        // Create parts from segments
        if (segments.length === 0) {
            // Keep part even if entirely empty
            result.push(part);
        } else if (segments.length === 1) {
            // No split needed, but remove trailing empty lines
            result.push({
                ...part,
                lines: lines.slice(segments[0].start, segments[0].end)
            });
        } else {
            // Split into multiple parts
            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];
                result.push({
                    ...part,
                    id: i === 0 ? part.id : `${part.id}-${i + 1}`,
                    index: i === 0 ? part.index : part.index + i,
                    lines: lines.slice(segment.start, segment.end)
                });
            }
        }
    }

    return result;
}

export function SongEditor({
    song,
    chordStyle: initialChordStyle = 'letters',
    displayKey,
    defaultMode = 'visual',
    onSave,
    onCancel,
    variant = 'page',
}: SongEditorProps) {
    // Editing state
    const [editingSong, setEditingSong] = useState<Partial<Song>>(() =>
        song ? { ...song } : createEmptySong()
    );

    // UI state
    const [mode, setMode] = useState<'visual' | 'raw'>(defaultMode);
    const [chordStyle, setChordStyle] = useState<ChordStyle>(initialChordStyle);
    const [lyricsLocked, setLyricsLocked] = useState(false);
    const [titleError, setTitleError] = useState(false);

    // Drag state
    const [draggedChord, setDraggedChord] = useState<DraggedChord | null>(null);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
    const [customChords, setCustomChords] = useState<string[]>([]);

    // Touch drag state
    const [touchDragPosition, setTouchDragPosition] = useState<{ x: number; y: number } | null>(null);
    const [touchDragChordDisplay, setTouchDragChordDisplay] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Active editing position (for click-to-insert)
    // TODO: Connect this to inline editing when implementing click-to-insert
    // const [activeEditPosition, setActiveEditPosition] = useState<{
    //     partIndex: number;
    //     lineIndex: number;
    //     charIndex: number;
    // } | null>(null);

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
        onDrop: (chord, targetElement) => {
            if (!targetElement) return;

            // Find the line element and calculate drop position
            const lineElement = targetElement.closest('[data-part-index][data-line-index]') as HTMLElement;
            if (lineElement) {
                const partIndex = parseInt(lineElement.dataset.partIndex || '0', 10);
                const lineIndex = parseInt(lineElement.dataset.lineIndex || '0', 10);

                // Calculate character position based on touch position
                const segmentText = lineElement.querySelector('[class*="segmentText"]') as HTMLElement;
                if (segmentText) {
                    const rect = segmentText.getBoundingClientRect();
                    const touchX = touchDrag.position?.x || 0;
                    const relX = touchX - rect.left;
                    const text = segmentText.textContent || '';
                    const charWidth = text.length > 0 ? rect.width / text.length : 10;
                    const charIndex = Math.max(0, Math.min(Math.round(relX / charWidth), text.length));

                    handleChordDrop({ partIndex, lineIndex, charIndex });
                    return;
                }
            }

            // Check if dropped on delete zone
            if (targetElement.closest('[class*="deleteZone"]')) {
                // Delete chord logic is handled by the delete zone itself
            }
        },
    });

    // Update touch drag position for indicator
    if (touchDrag.position && touchDrag.position !== touchDragPosition) {
        setTouchDragPosition(touchDrag.position);
    }

    // Handler for starting touch drag on a chord
    const handleTouchDragStart = useCallback((chord: DraggedChord, e: React.TouchEvent) => {
        const touch = e.touches[0];
        if (touch) {
            touchDrag.startDrag(chord, touch);
        }
    }, [touchDrag]);

    // ...

    const handleAddCustomChord = useCallback((chord: string) => {
        setCustomChords(prev => [...prev, chord]);
    }, []);

    const currentKey = displayKey || editingSong.originalKey || 'C';

    // Handler for clicking/tapping a chord to insert at cursor position
    // TODO: Re-enable when implementing click-to-insert chord feature
    // const handleChordClick = useCallback((chordStr: string) => {
    //     if (!activeEditPosition) return;

    //     const { partIndex, lineIndex, charIndex } = activeEditPosition;

    //     setEditingSong(prev => {
    //         const parts = [...(prev.parts || [])];
    //         const part = parts[partIndex];
    //         if (!part) return prev;

    //         const lines = [...part.lines];
    //         const line = lines[lineIndex];
    //         if (!line) return prev;

    //         const { text: pureText, chords: existingChords } = extractChordsFromLine(line.text);

    //         // Add new chord at cursor position
    //         const parsedChord = parseNashville(chordStr);
    //         const newChord = {
    //             index: charIndex,
    //             chord: parsedChord || { degree: 1, quality: '' }
    //         };

    //         const allChords = [...existingChords, newChord].sort((a, b) => a.index - b.index);

    //         // Rebuild line text
    //         let newText = '';
    //         let lastIndex = 0;
    //         for (const c of allChords) {
    //             newText += pureText.substring(lastIndex, c.index);
    //             newText += `[${formatChord(c.chord, currentKey, 'nashville')}]`;
    //             lastIndex = c.index;
    //         }
    //         newText += pureText.substring(lastIndex);

    //         lines[lineIndex] = { text: newText };
    //         parts[partIndex] = { ...part, lines };

    //         return { ...prev, parts };
    //     });
    // }, [currentKey]);

    // Handler for updating active edit position (called from segments)
    // TODO: Connect this to segment editors when implementing inline editing
    // const handleActivePositionChange = useCallback((position: { partIndex: number; lineIndex: number; charIndex: number } | null) => {
    //     setActiveEditPosition(position);
    // }, []);

    // Extract all unique chords from the current song for the palette
    const songChords = useMemo(() => {
        const chordSet = new Set<string>();
        for (const part of editingSong.parts || []) {
            for (const line of part.lines) {
                const { chords } = extractChordsFromLine(line.text);
                for (const c of chords) {
                    // Convert NashvilleChord to string representation
                    const chordStr = formatChord(c.chord, currentKey, 'nashville');
                    if (chordStr) chordSet.add(chordStr);
                }
            }
        }
        // Filter out the default palette chords to avoid duplicates
        const defaultChords = new Set(['1', '4', '5', '6m', '2m', '3m']);
        return Array.from(chordSet).filter(c => !defaultChords.has(c));
    }, [editingSong.parts, currentKey]);

    // Part handlers
    const handleAddPart = useCallback((type: PartType) => {
        setEditingSong(prev => {
            const parts = prev.parts || [];
            const newPartId = generatePartId(type, parts);
            const index = parts.filter(p => p.type === type).length + 1;

            const newPart: SongPart = {
                id: newPartId,
                type,
                index,
                lines: [{ text: '' }],
            };

            return { ...prev, parts: [...parts, newPart] };
        });
    }, []);

    const handleRemovePart = useCallback((partIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            parts.splice(partIndex, 1);
            return { ...prev, parts };
        });
    }, []);

    const handleUpdatePart = useCallback((partIndex: number, updates: Partial<SongPart>) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            parts[partIndex] = { ...parts[partIndex], ...updates };
            // Auto-split parts with 3+ consecutive empty lines
            const splitParts = autoSplitParts(parts);
            return { ...prev, parts: splitParts };
        });
    }, []);

    // TODO: Implement drag-and-drop reordering UI
    // const handleReorderParts = useCallback((fromIndex: number, toIndex: number) => {
    //     setEditingSong(prev => {
    //         const parts = [...(prev.parts || [])];
    //         const [moved] = parts.splice(fromIndex, 1);
    //         parts.splice(toIndex, 0, moved);
    //         return { ...prev, parts };
    //     });
    // }, []);

    // Line handlers
    const handleUpdateLine = useCallback((partIndex: number, lineIndex: number, text: string) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const lines = [...parts[partIndex].lines];
            lines[lineIndex] = { text };
            parts[partIndex] = { ...parts[partIndex], lines };
            return { ...prev, parts };
        });
    }, []);

    const handleAddLine = useCallback((partIndex: number, afterLineIndex?: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const lines = [...parts[partIndex].lines];
            const insertIndex = afterLineIndex !== undefined ? afterLineIndex + 1 : lines.length;
            lines.splice(insertIndex, 0, { text: '' });
            parts[partIndex] = { ...parts[partIndex], lines };
            return { ...prev, parts };
        });
    }, []);

    const handleDeleteLine = useCallback((partIndex: number, lineIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const part = parts[partIndex];

            // If this is the last line in the part, delete the entire part
            if (part.lines.length === 1) {
                parts.splice(partIndex, 1);
                return { ...prev, parts };
            }

            // Otherwise just delete the line
            const lines = [...part.lines];
            lines.splice(lineIndex, 1);
            parts[partIndex] = { ...part, lines };
            return { ...prev, parts };
        });
    }, []);

    const handleSplitPart = useCallback((partIndex: number, atLineIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const part = parts[partIndex];

            // Can't split if we're at the first line or last line
            if (atLineIndex === 0 || atLineIndex >= part.lines.length - 1) {
                return prev;
            }

            // Split lines into two groups
            const firstPartLines = part.lines.slice(0, atLineIndex);
            const secondPartLines = part.lines.slice(atLineIndex + 1); // Skip the empty line

            // If either part would be empty, don't split
            if (firstPartLines.length === 0 || secondPartLines.length === 0) {
                return prev;
            }

            // Create the second part with same type
            const partCounts: Record<string, number> = {};
            parts.forEach(p => {
                partCounts[p.type] = (partCounts[p.type] || 0) + 1;
            });

            const newPart: SongPart = {
                id: generatePartId(part.type, parts),
                type: part.type,
                index: (partCounts[part.type] || 0) + 1,
                lines: secondPartLines,
            };

            // Update the original part with first half of lines
            parts[partIndex] = { ...part, lines: firstPartLines };

            // Insert new part after current
            parts.splice(partIndex + 1, 0, newPart);

            return { ...prev, parts };
        });
    }, []);

    const handleJoinParts = useCallback((partIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            if (partIndex >= parts.length - 1) return prev; // No next part to join with

            const currentPart = parts[partIndex];
            const nextPart = parts[partIndex + 1];

            // Merge lines from both parts
            const mergedLines = [...currentPart.lines, ...nextPart.lines];

            // Update current part with merged lines
            parts[partIndex] = { ...currentPart, lines: mergedLines };

            // Remove next part
            parts.splice(partIndex + 1, 1);

            return { ...prev, parts };
        });
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

    const handleChordDrop = useCallback((position: DropPosition, dataTransfer?: DataTransfer) => {
        // Try to get chord from state first, then fall back to dataTransfer
        let chord = draggedChord;
        if (!chord && dataTransfer) {
            try {
                const chordData = dataTransfer.getData('application/x-chord');
                if (chordData) {
                    chord = JSON.parse(chordData) as DraggedChord;
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
            if (chord.source === 'line' &&
                chord.originalLineIndex === position.lineIndex &&
                chord.originalCharIndex !== undefined) {

                // Filter out the chord being moved
                chordsToKeep = existingChords.filter(c =>
                    !(c.index === chord.originalCharIndex &&
                        formatChord(c.chord, currentKey, 'nashville') === chord.chord)
                );
            }

            // Step 2: Add the new chord at drop position
            const parsedChord = parseNashville(chord.chord);
            const newChord = {
                index: position.charIndex,
                chord: parsedChord || { degree: 1, root: 'C', quality: '', alterations: [] }
            };

            const allChords = [...chordsToKeep, newChord].sort((a, b) => a.index - b.index);

            // Step 3: Rebuild the line text with chords in correct positions
            let newText = '';
            let lastIndex = 0;

            for (const chord of allChords) {
                // Add text before this chord
                newText += targetPureText.substring(lastIndex, chord.index);
                // Add chord marker
                newText += `[${formatChord(chord.chord, currentKey, 'nashville')}]`;
                lastIndex = chord.index;
            }
            // Add remaining text
            newText += targetPureText.substring(lastIndex);

            targetLines[position.lineIndex] = { text: newText };
            parts[position.partIndex] = { ...targetPart, lines: targetLines };

            // Step 4: Remove from original line if it was from a different line or part
            if (chord.source === 'line' &&
                chord.originalLineIndex !== undefined &&
                chord.originalCharIndex !== undefined &&
                (chord.originalLineIndex !== position.lineIndex ||
                 chord.originalPartIndex !== position.partIndex)) {

                const sourcePartIndex = chord.originalPartIndex ?? position.partIndex;
                const sourcePart = parts[sourcePartIndex];
                if (sourcePart) {
                    const sourceLines = [...sourcePart.lines];
                    const sourceLine = sourceLines[chord.originalLineIndex];

                    if (sourceLine) {
                        const { text: sourcePureText, chords: sourceChords } = extractChordsFromLine(sourceLine.text);

                        // Remove the dragged chord
                        const remainingChords = sourceChords.filter(c =>
                            !(c.index === chord.originalCharIndex &&
                                formatChord(c.chord, currentKey, 'nashville') === chord.chord)
                        );

                        // Rebuild source line
                        let sourceText = '';
                        let sourceLastIndex = 0;
                        for (const chd of remainingChords) {
                            sourceText += sourcePureText.substring(sourceLastIndex, chd.index);
                            sourceText += `[${formatChord(chd.chord, currentKey, 'nashville')}]`;
                            sourceLastIndex = chd.index;
                        }
                        sourceText += sourcePureText.substring(sourceLastIndex);

                        sourceLines[chord.originalLineIndex] = { text: sourceText };
                        parts[sourcePartIndex] = { ...sourcePart, lines: sourceLines };
                    }
                }
            }

            return { ...prev, parts };
        });

        setDraggedChord(null);
        setDropPosition(null);
    }, [draggedChord, currentKey]);

    // Save handler
    const handleSave = useCallback(() => {
        if (!editingSong.title?.trim()) {
            setTitleError(true);
            return;
        }

        setTitleError(false);

        if (onSave) {
            onSave(editingSong as Song);
        }
    }, [editingSong, onSave]);

    // Raw mode sync - parse raw content back into structured parts
    const handleRawChange = useCallback((rawContent: string) => {
        const parts: SongPart[] = [];
        const lines = rawContent.split('\n');

        let currentPart: SongPart | null = null;
        const partCounts: Record<string, number> = {};

        for (const line of lines) {
            // Check for part header: #verse 1, #chorus 1, etc.
            const headerMatch = line.match(/^#(\w+(?:-\w+)?)\s*(\d*)$/i);

            if (headerMatch) {
                // Save previous part if exists
                if (currentPart) {
                    parts.push(currentPart);
                }

                const partType = headerMatch[1].toLowerCase() as PartType;
                const explicitIndex = headerMatch[2] ? parseInt(headerMatch[2], 10) : null;

                // Track part counts for ID generation
                partCounts[partType] = (partCounts[partType] || 0) + 1;
                const index = explicitIndex || partCounts[partType];

                currentPart = {
                    id: generatePartId(partType, parts),
                    type: partType,
                    index,
                    lines: [],
                };
            } else if (currentPart) {
                // Add line to current part
                currentPart.lines.push({ text: line });
            } else if (line.trim()) {
                // No part yet, create a default verse
                currentPart = {
                    id: generatePartId('verse', parts),
                    type: 'verse',
                    index: 1,
                    lines: [{ text: line }],
                };
                partCounts['verse'] = 1;
            }
        }

        // Don't forget the last part
        if (currentPart) {
            parts.push(currentPart);
        }

        // Ensure at least one part exists
        if (parts.length === 0) {
            parts.push({
                id: 'V1',
                type: 'verse',
                index: 1,
                lines: [{ text: '' }],
            });
        }

        setEditingSong(prev => ({ ...prev, parts }));
    }, []);

    const rawContent = useMemo(() => {
        return (editingSong.parts || [])
            .map(part => {
                const header = `#${part.type} ${part.index}`;
                const lines = part.lines.map(l => l.text).join('\n');
                return `${header}\n${lines}`;
            })
            .join('\n\n');
    }, [editingSong.parts]);

    const containerClass = `${styles.container} ${styles[variant] || ''} ${touchDrag.isDragging ? styles.isDragging : ''}`;

    return (
        <div ref={containerRef} className={containerClass}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleRow}>
                    <input
                        type="text"
                        className={`${styles.titleInput} ${titleError ? styles.invalid : ''}`}
                        placeholder="Song Title *"
                        value={editingSong.title || ''}
                        onChange={(e) => {
                            setEditingSong(prev => ({ ...prev, title: e.target.value }));
                            if (e.target.value.trim()) setTitleError(false);
                        }}
                    />

                    <div className={styles.modeToggle}>
                        <button
                            className={`${styles.modeButton} ${mode === 'visual' ? styles.active : ''}`}
                            onClick={() => setMode('visual')}
                        >
                            Visual
                        </button>
                        <button
                            className={`${styles.modeButton} ${mode === 'raw' ? styles.active : ''}`}
                            onClick={() => setMode('raw')}
                        >
                            Raw
                        </button>
                    </div>
                </div>

                {titleError && <span className={styles.error}>Title is required</span>}

                <div className={styles.metaRow}>
                    <input
                        type="text"
                        className={styles.metaInput}
                        placeholder="Author"
                        value={editingSong.author || ''}
                        onChange={(e) => setEditingSong(prev => ({ ...prev, author: e.target.value }))}
                    />

                    <select
                        className={styles.select}
                        value={editingSong.originalKey || 'C'}
                        onChange={(e) => setEditingSong(prev => ({ ...prev, originalKey: e.target.value as Key }))}
                    >
                        {KEYS.map(k => (
                            <option key={k} value={k}>{k}</option>
                        ))}
                    </select>

                    <select
                        className={styles.select}
                        value={chordStyle}
                        onChange={(e) => setChordStyle(e.target.value as ChordStyle)}
                    >
                        <option value="letters">Letters (C, Am)</option>
                        <option value="nashville">Nashville (1, 6m)</option>
                        <option value="roman">Roman (I, vi)</option>
                    </select>
                </div>
            </div>

            {/* Toolbar (Visual mode only) */}
            {mode === 'visual' && (
                <SongEditorToolbar
                    currentKey={currentKey}
                    chordStyle={chordStyle}
                    lyricsLocked={lyricsLocked}
                    onLockToggle={() => setLyricsLocked(!lyricsLocked)}
                    onChordDragStart={handleChordDragStart}
                    onTouchDragStart={handleTouchDragStart}
                    customChords={customChords}
                    songChords={songChords}
                    onAddCustomChord={handleAddCustomChord}
                />
            )}

            {/* Content */}
            <div className={styles.content}>
                {mode === 'visual' ? (
                    <>
                        {(editingSong.parts || []).map((part, partIndex) => (
                            <SongPartEditor
                                key={part.id}
                                part={part}
                                partIndex={partIndex}
                                currentKey={currentKey}
                                chordStyle={chordStyle}
                                lyricsLocked={lyricsLocked}
                                draggedChord={draggedChord}
                                dropPosition={dropPosition}
                                onUpdatePart={(updates) => handleUpdatePart(partIndex, updates)}
                                onRemovePart={() => handleRemovePart(partIndex)}
                                onUpdateLine={(lineIndex, text) => handleUpdateLine(partIndex, lineIndex, text)}
                                onAddLine={(afterLineIndex) => handleAddLine(partIndex, afterLineIndex)}
                                onDeleteLine={(lineIndex) => handleDeleteLine(partIndex, lineIndex)}
                                onSplitPart={(atLineIndex) => handleSplitPart(partIndex, atLineIndex)}
                                onJoinWithNext={() => handleJoinParts(partIndex)}
                                hasNextPart={partIndex < (editingSong.parts?.length || 0) - 1}
                                onDropPositionChange={handleDropPositionChange}
                                onChordDrop={handleChordDrop}
                                onChordDragStart={handleChordDragStart}
                                onChordDragEnd={handleChordDragEnd}
                            />
                        ))}

                        <PartManager onAddPart={handleAddPart} />

                        <ArrangementPanel
                            arrangements={editingSong.arrangements || []}
                            parts={editingSong.parts || []}
                            defaultArrangement={editingSong.defaultArrangement || []}
                            onAddArrangement={() => { }} // TODO
                            onUpdateArrangement={() => { }} // TODO
                            onRemoveArrangement={() => { }} // TODO
                            onReferencePart={() => { }} // TODO
                        />
                    </>
                ) : (
                    <SongRawEditor
                        content={rawContent}
                        onContentChange={handleRawChange}
                    />
                )}
            </div>

            {/* Footer */}
            <div className={styles.footer}>
                <div className={styles.footerLeft}>
                    {mode === 'visual' && (
                        <button
                            className={`${styles.lockButton} ${lyricsLocked ? styles.locked : ''}`}
                            onClick={() => setLyricsLocked(!lyricsLocked)}
                        >
                            {lyricsLocked ? '🔒 Lyrics Locked' : '🔓 Lock Lyrics'}
                        </button>
                    )}
                </div>

                <div className={styles.footerRight}>
                    {onCancel && (
                        <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={onCancel}>
                            Cancel
                        </button>
                    )}
                    <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleSave}>
                        Save
                    </button>
                </div>
            </div>

            {/* Delete Drop Zone - Shows when dragging */}
            {draggedChord && (
                <div
                    className={`${styles.deleteZone} ${styles.visible}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // Try to get chord from state first, then fall back to dataTransfer
                        let chord = draggedChord;
                        if (!chord) {
                            try {
                                const chordData = e.dataTransfer.getData('application/x-chord');
                                if (chordData) {
                                    chord = JSON.parse(chordData) as DraggedChord;
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

                            const { originalPartIndex, originalLineIndex, originalCharIndex } = chord;

                            setEditingSong(prev => {
                                const parts = [...(prev.parts || [])];
                                const part = parts[originalPartIndex];
                                if (!part) return prev;

                                const lines = [...part.lines];
                                const line = lines[originalLineIndex];
                                if (!line) return prev;

                                const { text: pureText, chords } = extractChordsFromLine(line.text);

                                // Remove the chord
                                const remainingChords = chords.filter(c =>
                                    !(c.index === originalCharIndex &&
                                        formatChord(c.chord, currentKey, 'nashville') === chord.chord)
                                );

                                // Rebuild line text
                                let newText = '';
                                let lastIndex = 0;
                                for (const chd of remainingChords) {
                                    newText += pureText.substring(lastIndex, chd.index);
                                    newText += `[${formatChord(chd.chord, currentKey, 'nashville')}]`;
                                    lastIndex = chd.index;
                                }
                                newText += pureText.substring(lastIndex);

                                lines[originalLineIndex] = { text: newText };
                                parts[originalPartIndex] = { ...part, lines };

                                return { ...prev, parts };
                            });
                        }

                        setDraggedChord(null);
                        setDropPosition(null);
                    }}
                >
                    🗑️ Drop here to delete
                </div>
            )}

            {/* Touch drag indicator */}
            {touchDrag.isDragging && touchDragPosition && touchDragChordDisplay && (
                <DragIndicator
                    chord={touchDragChordDisplay}
                    position={touchDragPosition}
                />
            )}
        </div>
    );
}
