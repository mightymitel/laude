/**
 * Official-arrangement composer (WP-167 / DEC-138/144/147/149). An
 * arrangement is an ORDERED LIST OF PART REFS with repeats allowed — never
 * a content copy. Tap a part to append its ref; drag chips to reorder;
 * × removes one occurrence. Writes song.defaultArrangement (the official
 * arrangement — the songs.default_key analogue).
 *
 * Forward seam (DEC-152, not built): the same surface will target a
 * PERSONAL arrangement when the user doesn't own the song.
 */
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SongPart } from '@laudasist/shared';
import styles from './SongEditor.module.css';

const TYPE_LETTER: Record<string, string> = {
    verse: 'V',
    chorus: 'C',
    bridge: 'B',
    'pre-chorus': 'P',
    intro: 'I',
    outro: 'O',
    tag: 'T',
};

/** Canonical ref for a part: type letter + index (occurrence when unset). */
export function refOfPart(parts: readonly SongPart[], partIndex: number): string {
    const part = parts[partIndex]!;
    const letter = TYPE_LETTER[part.type] ?? 'V';
    if (part.index > 0) return `${letter}${part.index}`;
    let occurrence = 0;
    for (let i = 0; i <= partIndex; i++) {
        if (parts[i]!.type === part.type) occurrence += 1;
    }
    return `${letter}${occurrence}`;
}

export function arrangementSortId(position: number): string {
    return `arr-sort:${position}`;
}

function RefChip({ refLabel, position, onRemove }: {
    refLabel: string;
    position: number;
    onRemove: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: arrangementSortId(position),
        data: { type: 'arr-sort', position },
    });
    return (
        <span
            ref={setNodeRef}
            className={`${styles.arrChip} ${isDragging ? styles.dragging : ''}`}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            data-testid={`arr-chip-${position}`}
        >
            <span className={styles.arrChipHandle} {...attributes} {...listeners}>
                {refLabel}
            </span>
            <button
                className={styles.arrChipRemove}
                aria-label={`Remove ${refLabel} at position ${position + 1}`}
                onClick={onRemove}
            >
                ×
            </button>
        </span>
    );
}

export function ArrangementComposer({
    parts,
    order,
    onChange,
}: {
    parts: SongPart[];
    order: string[];
    onChange: (order: string[]) => void;
}) {
    return (
        <div className={styles.arrComposer} data-testid="arrangement-composer">
            <h3 className={styles.arrTitle}>
                Official arrangement
                <span className={styles.arrHint}>
                    {order.length === 0
                        ? ' — none yet: parts play top-to-bottom. Tap a part below to compose one.'
                        : ' — drag to reorder, × to remove. Repeats welcome.'}
                </span>
            </h3>

            <div className={styles.arrRow}>
                <SortableContext
                    items={order.map((_, i) => arrangementSortId(i))}
                    strategy={horizontalListSortingStrategy}
                >
                    {order.map((ref, i) => (
                        <RefChip
                            key={`${ref}:${i}`}
                            refLabel={ref}
                            position={i}
                            onRemove={() => onChange(order.filter((_, j) => j !== i))}
                        />
                    ))}
                </SortableContext>
            </div>

            <div className={styles.arrAddRow}>
                {parts.map((part, i) => {
                    const ref = refOfPart(parts, i);
                    return (
                        <button
                            key={`${part.id}:${i}`}
                            className={styles.arrAddBtn}
                            data-testid={`arr-add-${ref}`}
                            title={`Append ${part.type} ${part.index || ''}`.trim()}
                            onClick={() => onChange([...order, ref])}
                        >
                            + {ref}
                        </button>
                    );
                })}
                {order.length > 0 && (
                    <button className={styles.arrClearBtn} onClick={() => onChange([])}>
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}
