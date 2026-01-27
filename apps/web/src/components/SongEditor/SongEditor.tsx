import { useState, useCallback, useMemo } from 'react';
import {
    Song, SongPart, Key, ChordStyle, PartType,
    formatChord, parseNashville, extractChordsFromLine, NashvilleChord
} from '@laudasist/shared';
import { SongEditorProps, DraggedChord, DropPosition } from './types';
import { SongEditorToolbar } from './SongEditorToolbar';
import { SongPartEditor } from './SongPartEditor';
import { SongRawEditor } from './SongRawEditor';
import { PartManager } from './PartManager';
import { ArrangementPanel } from './ArrangementPanel';
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

    // ...

    const handleAddCustomChord = useCallback((chord: string) => {
        setCustomChords(prev => [...prev, chord]);
    }, []);

    const currentKey = displayKey || editingSong.originalKey || 'C';

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
            return { ...prev, parts };
        });
    }, []);

    const handleReorderParts = useCallback((fromIndex: number, toIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const [moved] = parts.splice(fromIndex, 1);
            parts.splice(toIndex, 0, moved);
            return { ...prev, parts };
        });
    }, []);

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

    const handleAddLine = useCallback((partIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const lines = [...parts[partIndex].lines, { text: '' }];
            parts[partIndex] = { ...parts[partIndex], lines };
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

    const handleChordDrop = useCallback((position: DropPosition) => {
        if (!draggedChord) return;

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
            if (draggedChord.source === 'line' &&
                draggedChord.originalLineIndex === position.lineIndex &&
                draggedChord.originalCharIndex !== undefined) {

                // Filter out the chord being moved
                chordsToKeep = existingChords.filter(c =>
                    !(c.index === draggedChord.originalCharIndex &&
                        formatChord(c.chord, currentKey, 'nashville') === draggedChord.chord)
                );
            }

            // Step 2: Add the new chord at drop position
            const parsedChord = parseNashville(draggedChord.chord);
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
            if (draggedChord.source === 'line' &&
                draggedChord.originalLineIndex !== undefined &&
                draggedChord.originalCharIndex !== undefined &&
                (draggedChord.originalLineIndex !== position.lineIndex ||
                 draggedChord.originalPartIndex !== position.partIndex)) {

                const sourcePartIndex = draggedChord.originalPartIndex ?? position.partIndex;
                const sourcePart = parts[sourcePartIndex];
                if (sourcePart) {
                    const sourceLines = [...sourcePart.lines];
                    const sourceLine = sourceLines[draggedChord.originalLineIndex];

                    if (sourceLine) {
                        const { text: sourcePureText, chords: sourceChords } = extractChordsFromLine(sourceLine.text);

                        // Remove the dragged chord
                        const remainingChords = sourceChords.filter(c =>
                            !(c.index === draggedChord.originalCharIndex &&
                                formatChord(c.chord, currentKey, 'nashville') === draggedChord.chord)
                        );

                        // Rebuild source line
                        let sourceText = '';
                        let sourceLastIndex = 0;
                        for (const chord of remainingChords) {
                            sourceText += sourcePureText.substring(sourceLastIndex, chord.index);
                            sourceText += `[${formatChord(chord.chord, currentKey, 'nashville')}]`;
                            sourceLastIndex = chord.index;
                        }
                        sourceText += sourcePureText.substring(sourceLastIndex);

                        sourceLines[draggedChord.originalLineIndex] = { text: sourceText };
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

    // Raw mode sync
    const handleRawChange = useCallback((rawContent: string) => {
        // TODO: Parse raw content back into parts
        // For now, just store in first part
        setEditingSong(prev => {
            const parts: SongPart[] = [{
                id: 'raw',
                type: 'verse',
                index: 1,
                lines: rawContent.split('\n').map(text => ({ text })),
            }];
            return { ...prev, parts };
        });
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

    const containerClass = `${styles.container} ${styles[variant] || ''}`;

    return (
        <div className={containerClass}>
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
                                onAddLine={() => handleAddLine(partIndex)}
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
                        onChange={handleRawChange}
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

                        // Remove chord from original position
                        if (draggedChord.source === 'line' &&
                            draggedChord.originalPartIndex !== undefined &&
                            draggedChord.originalLineIndex !== undefined &&
                            draggedChord.originalCharIndex !== undefined) {

                            const { originalPartIndex, originalLineIndex, originalCharIndex } = draggedChord;

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
                                        formatChord(c.chord, currentKey, 'nashville') === draggedChord.chord)
                                );

                                // Rebuild line text
                                let newText = '';
                                let lastIndex = 0;
                                for (const chord of remainingChords) {
                                    newText += pureText.substring(lastIndex, chord.index);
                                    newText += `[${formatChord(chord.chord, currentKey, 'nashville')}]`;
                                    lastIndex = chord.index;
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
        </div>
    );
}
