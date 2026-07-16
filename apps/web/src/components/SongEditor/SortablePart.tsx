/**
 * Sortable wrapper for a part editor (WP-167): a grip handle reorders whole
 * parts by drag. Registers in the editor's single DndContext with
 * data.type 'part-sort' — the chord layer ignores non-chord drags.
 */
import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './SongEditor.module.css';

export function partSortId(index: number): string {
    return `part-sort:${index}`;
}

export function SortablePart({ index, children }: { index: number; children: ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: partSortId(index),
        data: { type: 'part-sort', index },
    });
    return (
        <div
            ref={setNodeRef}
            className={`${styles.sortablePart} ${isDragging ? styles.dragging : ''}`}
            style={{ transform: CSS.Transform.toString(transform), transition }}
        >
            <button
                className={styles.partGrip}
                aria-label={`Reorder part ${index + 1}`}
                title="Drag to reorder this part"
                {...attributes}
                {...listeners}
            >
                ⠿
            </button>
            <div className={styles.sortablePartBody}>{children}</div>
        </div>
    );
}
