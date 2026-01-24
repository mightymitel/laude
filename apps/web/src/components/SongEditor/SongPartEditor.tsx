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
    onAddLine: () => void;
    onDropPositionChange: (position: DropPosition | null) => void;
    onChordDrop: (position: DropPosition) => void;
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
    onDropPositionChange,
    onChordDrop,
    onChordDragStart,
    onChordDragEnd,
}: SongPartEditorProps) {

    const defaultLabel = `${PART_TYPE_LABELS[part.type] || part.type} ${part.index || ''}`;

    const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Parse custom label back to type+index, or just store as custom
        // For now, just update the ID which we use as label
        onUpdatePart({ id: e.target.value || part.id });
    };

    const handleKeyDown = (e: React.KeyboardEvent, lineIndex: number) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onAddLine();
        }
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
                        onKeyDown={(e) => handleKeyDown(e, lineIndex)}
                        onDropPositionChange={(charIndex) => {
                            if (charIndex !== null) {
                                onDropPositionChange({ partIndex, lineIndex, charIndex });
                            } else {
                                onDropPositionChange(null);
                            }
                        }}
                        onChordDrop={() => {
                            if (dropPosition) {
                                onChordDrop(dropPosition);
                            }
                        }}
                        onChordDragStart={onChordDragStart}
                        onChordDragEnd={onChordDragEnd}
                    />
                ))}
            </div>
        </div>
    );
}
