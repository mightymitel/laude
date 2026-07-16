import { useCallback, useRef, useState } from 'react';
import { SongPart, Key, ChordStyle } from '@laudasist/shared';
import { DraggedChord, DropPosition } from './types';
import { SongLineEditor } from './SongLineEditor';
import styles from './SongEditor.module.css';

interface SongPartEditorProps {
    part: SongPart;
    partIndex: number;
    currentKey: Key;
    chordStyle: ChordStyle;
    lyricsLocked: boolean;
    draggedChord: DraggedChord | null;
    dropPosition: DropPosition | null;
    allParts: SongPart[];
    onUpdatePart: (updates: Partial<SongPart>) => void;
    onRemovePart: () => void;
    onUpdateLine: (lineIndex: number, text: string) => void;
    onAddLine: (afterLineIndex?: number) => void;
    onDeleteLine: (lineIndex: number) => void;
    onSplitPart: (atLineIndex: number) => void;
    onJoinWithNext: () => void;
    hasNextPart: boolean;

    onApproximateChords?: (sourcePartIndex: number) => void;
}

const PART_TYPE_LABELS: Record<string, string> = {
    verse: 'Verse',
    chorus: 'Chorus',
    bridge: 'Bridge',
    'pre-chorus': 'Pre-Chorus',
    intro: 'Intro',
    outro: 'Outro',
    tag: 'Tag',
};

export function SongPartEditor({
    part,
    partIndex,
    currentKey,
    chordStyle,
    lyricsLocked,
    draggedChord,
    dropPosition,
    allParts,
    onUpdatePart,
    onRemovePart,
    onUpdateLine,
    onAddLine,
    onDeleteLine,
    onSplitPart,
    onJoinWithNext,
    hasNextPart,
    onApproximateChords,
}: SongPartEditorProps) {
    const [showChordSourceMenu, setShowChordSourceMenu] = useState(false);

    const defaultLabel = `${PART_TYPE_LABELS[part.type] || part.type} ${part.index || ''}`;

    const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Parse custom label back to type+index, or just store as custom
        // For now, just update the ID which we use as label
        onUpdatePart({ id: e.target.value || part.id });
    };

    const handleKeyDown = (e: React.KeyboardEvent, lineIndex: number, lineText: string) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // If line is empty and not the first line, split the part here
            if (lineText.trim() === '' && lineIndex > 0 && lineIndex < part.lines.length - 1) {
                onSplitPart(lineIndex);
            } else {
                onAddLine(lineIndex);
            }
        }
    };

    const handleDeleteLine = (lineIndex: number) => {
        onDeleteLine(lineIndex);
    };

    const handleApproximateChords = (sourcePartIndex: number) => {
        if (onApproximateChords) {
            onApproximateChords(sourcePartIndex);
        }
        setShowChordSourceMenu(false);
    };

    const getPartLabel = (p: SongPart, idx: number) => {
        return `${PART_TYPE_LABELS[p.type] || p.type} ${p.index || idx + 1}`;
    };

    return (
        <div className={styles.part}>
            {/* Part Header */}
            <div className={styles.partHeader}>
                <span className={styles.partDragHandle} title="Drag to reorder">
                    ⋮⋮
                </span>

                <input
                    type="text"
                    className={styles.partLabelInput}
                    value={defaultLabel}
                    onChange={handleLabelChange}
                    placeholder="Part label"
                />

                <div className={styles.partActions}>
                    {onApproximateChords && allParts.length > 1 && (
                        <div style={{ position: 'relative' }}>
                            <button
                                className={styles.partActionButton}
                                onClick={() => setShowChordSourceMenu(!showChordSourceMenu)}
                                title="Approximate chords from another part"
                            >
                                ♪
                            </button>
                            {showChordSourceMenu && (
                                <div className={styles.chordSourceMenu}>
                                    <div className={styles.chordSourceMenuHeader}>
                                        Copy chords from:
                                    </div>
                                    {allParts.map((p, idx) => {
                                        if (idx === partIndex) return null;
                                        return (
                                            <button
                                                key={idx}
                                                className={styles.chordSourceMenuItem}
                                                onClick={() => handleApproximateChords(idx)}
                                            >
                                                {getPartLabel(p, idx)}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                    {hasNextPart && (
                        <button
                            className={styles.partActionButton}
                            onClick={onJoinWithNext}
                            title="Join with next part"
                        >
                            ⬇
                        </button>
                    )}
                    <button
                        className={`${styles.partActionButton} ${styles.delete}`}
                        onClick={onRemovePart}
                        title="Remove part"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Part Content - Lines */}
            <div className={styles.partContent}>
                {part.lines.map((line, lineIndex) => (
                    <SongLineEditor
                        key={lineIndex}
                        lineText={line.text}
                        partIndex={partIndex}
                        lineIndex={lineIndex}
                        currentKey={currentKey}
                        chordStyle={chordStyle}
                        lyricsLocked={lyricsLocked}
                        isDragging={draggedChord !== null}
                        isDropTarget={
                            dropPosition?.partIndex === partIndex &&
                            dropPosition?.lineIndex === lineIndex
                        }
                        dropCharIndex={
                            dropPosition?.partIndex === partIndex &&
                                dropPosition?.lineIndex === lineIndex
                                ? dropPosition.charIndex
                                : null
                        }
                        onTextChange={(text) => onUpdateLine(lineIndex, text)}
                        onKeyDown={(e) => handleKeyDown(e, lineIndex, line.text)}
                        onDeleteLine={() => handleDeleteLine(lineIndex)}
                    />
                ))}
            </div>
        </div>
    );
}
