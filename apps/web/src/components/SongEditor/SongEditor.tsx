import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DndContext, DragOverlay, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
import { ArrangementComposer } from './ArrangementComposer';
import { SortablePart, partSortId } from './SortablePart';
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

    // Dirty tracking (WP-173): the save button must not lie — disabled when
    // clean, guard on navigate-away when dirty. Serialized-form comparison
    // (songs are small); the baseline resets when a save is dispatched.
    const [savedBaseline, setSavedBaseline] = useState(() => JSON.stringify(song ?? {}));
    const isDirty = useMemo(
        () => JSON.stringify(editingSong) !== savedBaseline,
        [editingSong, savedBaseline],
    );
    useEffect(() => {
        if (!isDirty) return;
        const guard = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [isDirty]);

    // UI state
    const [mode, setMode] = useState<'visual' | 'raw'>(defaultMode);
    const [chordStyle, setChordStyle] = useState<ChordStyle>(initialChordStyle);
    const [lyricsLocked, setLyricsLocked] = useState(false);
    const [titleError, setTitleError] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentKey = displayKey || editingSong.defaultKey || 'C';

    const chordDrag = useChordDnd({ currentKey, chordStyle, setEditingSong });
    const partEditing = usePartEditing(setEditingSong);

    // One DndContext, three drag types: chords (the layer above), part
    // reorder, arrangement-chip reorder — discriminated by data.type.
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const activeData = event.active.data.current;
        const overData = event.over?.data.current;
        if (activeData?.type === 'part-sort') {
            if (overData?.type === 'part-sort' && typeof overData.index === 'number') {
                partEditing.handleReorderParts(activeData.index as number, overData.index);
            }
            return;
        }
        if (activeData?.type === 'arr-sort') {
            if (overData?.type === 'arr-sort' && typeof overData.position === 'number') {
                setEditingSong(prev => {
                    const order = [...(prev.defaultArrangement || [])];
                    const from = activeData.position as number;
                    const to = overData.position;
                    if (from === to || from >= order.length || to >= order.length) return prev;
                    const [moved] = order.splice(from, 1);
                    order.splice(to, 0, moved!);
                    return { ...prev, defaultArrangement: order };
                });
            }
            return;
        }
        chordDrag.onDragEnd(event);
    }, [partEditing, chordDrag, setEditingSong]);
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
        setSavedBaseline(JSON.stringify(editingSong));

        if (onSave) {
            onSave(editingSong as Song);
        }
    }, [editingSong, onSave]);

    const handleCancel = useCallback(() => {
        if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
        onCancel?.();
    }, [isDirty, onCancel]);

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
            onDragEnd={handleDragEnd}
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
                language={editingSong.language ?? 'ro'}
                onLanguageChange={(language) => setEditingSong(prev => ({ ...prev, language }))}
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
                        <SortableContext
                            items={(editingSong.parts || []).map((_, i) => partSortId(i))}
                            strategy={verticalListSortingStrategy}
                        >
                        {(editingSong.parts || []).map((part, partIndex) => (
                            <SortablePart key={`${part.id}-${partIndex}`} index={partIndex}>
                            <SongPartEditor
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
                            </SortablePart>
                        ))}
                        </SortableContext>

                        <PartManager onAddPart={partEditing.handleAddPart} />

                        <ArrangementComposer
                            parts={editingSong.parts || []}
                            order={editingSong.defaultArrangement || []}
                            onChange={(order) => setEditingSong(prev => ({ ...prev, defaultArrangement: order }))}
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
                        <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={handleCancel}>
                            Cancel
                        </button>
                    )}
                    <button
                        className={`${styles.button} ${styles.buttonPrimary}`}
                        onClick={handleSave}
                        disabled={!isDirty}
                        data-testid="editor-save"
                        title={isDirty ? 'Save your changes' : 'No unsaved changes'}
                    >
                        {isDirty ? 'Save' : 'Saved ✓'}
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
