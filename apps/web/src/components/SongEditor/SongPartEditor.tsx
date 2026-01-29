import { useCallback, useRef } from 'react';
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
    onUpdatePart: (updates: Partial<SongPart>) => void;
    onRemovePart: () => void;
    onUpdateLine: (lineIndex: number, text: string) => void;
    onAddLine: (afterLineIndex?: number) => void;
    onDeleteLine: (lineIndex: number) => void;
    onSplitPart: (atLineIndex: number) => void;
    onJoinWithNext: () => void;
    hasNextPart: boolean;
    onDropPositionChange: (position: DropPosition | null) => void;
    onChordDrop: (position: DropPosition, dataTransfer?: DataTransfer) => void;
    onChordDragStart: (chord: DraggedChord) => void;
    onChordDragEnd: () => void;
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
    onUpdatePart,
    onRemovePart,
    onUpdateLine,
    onAddLine,
    onDeleteLine,
    onSplitPart,
    onJoinWithNext,
    hasNextPart,
    onDropPositionChange,
    onChordDrop,
    onChordDragStart,
    onChordDragEnd,
}: SongPartEditorProps) {
    // Track last known drop position locally to handle race conditions
    const lastDropPositionRef = useRef<DropPosition | null>(null);

    const handleDropPositionChange = useCallback((lineIndex: number, charIndex: number | null) => {
        if (charIndex !== null) {
            const position = { partIndex, lineIndex, charIndex };
            lastDropPositionRef.current = position;
            onDropPositionChange(position);
        } else {
            // Don't clear ref immediately - keep it for drop
            onDropPositionChange(null);
        }
    }, [partIndex, onDropPositionChange]);

    const handleChordDrop = useCallback((lineIndex: number, dataTransfer?: DataTransfer) => {
        // Use the most recent position we have
        const position = dropPosition ?? lastDropPositionRef.current;
        if (position && position.partIndex === partIndex && position.lineIndex === lineIndex) {
            onChordDrop(position, dataTransfer);
        }
        lastDropPositionRef.current = null;
    }, [dropPosition, partIndex, onChordDrop]);

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
                        draggedChord={draggedChord}
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
                        onDropPositionChange={(charIndex) => handleDropPositionChange(lineIndex, charIndex)}
                        onChordDrop={(dataTransfer) => handleChordDrop(lineIndex, dataTransfer)}
                        onChordDragStart={onChordDragStart}
                        onChordDragEnd={onChordDragEnd}
                    />
                ))}
            </div>
        </div>
    );
}
