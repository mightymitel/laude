import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { Song, ChordStyle, formatChord, extractChordsFromLine } from '@laudasist/shared';
import { SongEditorProps } from './types';
import { createEmptySong, serializePartsToRaw } from './songEditorModel';
import { useChordDnd, DELETE_ZONE_ID } from './useChordDnd';
import { usePartEditing } from './usePartEditing';
import { SongEditorHeader } from './SongEditorHeader';
import { SongEditorToolbar } from './SongEditorToolbar';
import { SongPartEditor } from './SongPartEditor';
import { SongRawEditor } from './SongRawEditor';
import { PartManager } from './PartManager';
import { ArrangementPanel } from './ArrangementPanel';
import { ChordLoupe } from './ChordLoupe';
import styles from './SongEditor.module.css';

/** Delete target while a chord is dragged (dnd-kit droppable). */
function DeleteZone() {
    const { setNodeRef, isOver } = useDroppable({ id: DELETE_ZONE_ID });
    return (
        <div ref={setNodeRef} className={`${styles.deleteZone} ${styles.visible} ${isOver ? styles.locked : ''}`}>
            🗑️ Drop here to delete
        </div>
    );
}

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

    const chordDrag = useChordDnd({ currentKey, chordStyle, setEditingSong });
    const partEditing = usePartEditing(setEditingSong);
    // The drag layer reads line text during onDragMove through this peek —
    // without making the handlers depend on the whole editing state.
    useEffect(() => {
        chordDrag.editingSongPeek.current = editingSong;
    }, [editingSong, chordDrag.editingSongPeek]);

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

    const containerClass = `${styles.container} ${styles[variant] || ''} ${chordDrag.draggedChord ? styles.isDragging : ''}`;

    return (
        <DndContext
            sensors={chordDrag.sensors}
            onDragStart={chordDrag.onDragStart}
            onDragMove={chordDrag.onDragMove}
            onDragEnd={chordDrag.onDragEnd}
            onDragCancel={chordDrag.onDragCancel}
        >
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

            {/* Delete Drop Zone - shows when dragging a placed chord */}
            {chordDrag.draggedChord?.source === 'line' && <DeleteZone />}

            {/* The dragged chord follows the pointer (dnd-kit overlay). */}
            <DragOverlay dropAnimation={null}>
                {chordDrag.draggedChord ? (
                    <span className={styles.chordBadge}>
                        {chordDrag.displayOf(chordDrag.draggedChord.chord)}
                    </span>
                ) : null}
            </DragOverlay>

            {/* Magnifier loupe with insertion caret (touch only, WP-166). */}
            {chordDrag.loupe && (
                <ChordLoupe state={chordDrag.loupe} currentKey={currentKey} chordStyle={chordStyle} />
            )}
        </div>
        </DndContext>
    );
}
