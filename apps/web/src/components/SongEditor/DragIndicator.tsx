import styles from './SongEditor.module.css';

interface DragIndicatorProps {
    chord: string;
    position: { x: number; y: number };
}

export function DragIndicator({ chord, position }: DragIndicatorProps) {
    return (
        <div
            className={styles.dragIndicator}
            style={{
                left: position.x,
                top: position.y,
            }}
        >
            {chord}
        </div>
    );
}
