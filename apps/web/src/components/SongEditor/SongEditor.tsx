import { useState, useCallback, useMemo, useRef } from 'react';
import { Song, ChordStyle, formatChord, extractChordsFromLine } from '@laudasist/shared';
import { SongEditorProps } from './types';
import { createEmptySong, serializePartsToRaw } from './songEditorModel';
import { useChordDrag } from './useChordDrag';
import { usePartEditing } from './usePartEditing';
import { SongEditorHeader } from './SongEditorHeader';
import { SongEditorToolbar } from './SongEditorToolbar';
import { SongPartEditor } from './SongPartEditor';
import { SongRawEditor } from './SongRawEditor';
import { PartManager } from './PartManager';
import { ArrangementPanel } from './ArrangementPanel';
import { DragIndicator } from './DragIndicator';
import styles from './SongEditor.module.css';

export function SongEditor({
    song,
    chordStyle: initialChordStyle = 'letters',
    displayKey,
    defaultMode = 'visual',
    onSave,
    onCancel,
    variant = 'page',
    keyLocked = false,
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
    const containerRef = useRef<HTMLDivElement>(null);

    const currentKey = displayKey || editingSong.defaultKey || 'C';

    const chordDrag = useChordDrag({ currentKey, chordStyle, setEditingSong });
    const partEditing = usePartEditing(setEditingSong);

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

    const handleTitleChange = useCallback((title: string) => {
        setEditingSong(prev => ({ ...prev, title }));
        if (title.trim()) setTitleError(false);
    }, []);

    const rawContent = useMemo(() => serializePartsToRaw(editingSong.parts || []), [editingSong.parts]);

    const containerClass = `${styles.container} ${styles[variant] || ''} ${chordDrag.isTouchDragging ? styles.isDragging : ''}`;

    return (
        <div ref={containerRef} className={containerClass}>
            <SongEditorHeader
                title={editingSong.title || ''}
                author={editingSong.author || ''}
                defaultKey={editingSong.defaultKey || 'C'}
                chordStyle={chordStyle}
                mode={mode}
                titleError={titleError}
                onTitleChange={handleTitleChange}
                onAuthorChange={(author) => setEditingSong(prev => ({ ...prev, author }))}
                keyLocked={keyLocked}
                onKeyChange={(defaultKey) => setEditingSong(prev => ({ ...prev, defaultKey }))}
                onChordStyleChange={setChordStyle}
                onModeChange={setMode}
            />

            {/* Toolbar (Visual mode only) */}
            {mode === 'visual' && (
                <SongEditorToolbar
                    currentKey={currentKey}
                    chordStyle={chordStyle}
                    lyricsLocked={lyricsLocked}
                    onLockToggle={() => setLyricsLocked(!lyricsLocked)}
                    onChordDragStart={chordDrag.handleChordDragStart}
                    onTouchDragStart={chordDrag.handleTouchDragStart}
                    customChords={chordDrag.customChords}
                    songChords={songChords}
                    onAddCustomChord={chordDrag.handleAddCustomChord}
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
                                draggedChord={chordDrag.draggedChord}
                                dropPosition={chordDrag.dropPosition}
                                allParts={editingSong.parts || []}
                                onUpdatePart={(updates) => partEditing.handleUpdatePart(partIndex, updates)}
                                onRemovePart={() => partEditing.handleRemovePart(partIndex)}
                                onUpdateLine={(lineIndex, text) => partEditing.handleUpdateLine(partIndex, lineIndex, text)}
                                onAddLine={(afterLineIndex) => partEditing.handleAddLine(partIndex, afterLineIndex)}
                                onDeleteLine={(lineIndex) => partEditing.handleDeleteLine(partIndex, lineIndex)}
                                onSplitPart={(atLineIndex) => partEditing.handleSplitPart(partIndex, atLineIndex)}
                                onJoinWithNext={() => partEditing.handleJoinParts(partIndex)}
                                hasNextPart={partIndex < (editingSong.parts?.length || 0) - 1}
                                onDropPositionChange={chordDrag.handleDropPositionChange}
                                onChordDrop={chordDrag.handleChordDrop}
                                onChordDragStart={chordDrag.handleChordDragStart}
                                onChordDragEnd={chordDrag.handleChordDragEnd}
                                onApproximateChords={(sourcePartIndex) =>
                                    partEditing.handleApproximateChords(partIndex, sourcePartIndex)
                                }
                            />
                        ))}

                        <PartManager onAddPart={partEditing.handleAddPart} />

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
                        onContentChange={partEditing.handleRawChange}
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
            {chordDrag.draggedChord && (
                <div
                    className={`${styles.deleteZone} ${styles.visible}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={chordDrag.handleDeleteZoneDrop}
                >
                    🗑️ Drop here to delete
                </div>
            )}

            {/* Touch drag indicator */}
            {chordDrag.isTouchDragging && chordDrag.touchDragPosition && chordDrag.touchDragChordDisplay && (
                <DragIndicator
                    chord={chordDrag.touchDragChordDisplay}
                    position={chordDrag.touchDragPosition}
                />
            )}
        </div>
    );
}
