import styles from './SongEditor.module.css';

interface ChordAlterationMenuProps {
    baseChord: string; // e.g. "1", "6m"
    onSelect: (chord: string) => void;
    onClose: () => void;
    position: { x: number; y: number };
}

const COMMON_ALTERATIONS = [
    { label: '7', suffix: '7' },
    { label: 'maj7', suffix: 'maj7' },
    { label: 'sus4', suffix: 'sus4' },
    { label: 'sus2', suffix: 'sus2' },
    { label: 'm7', suffix: 'm7' },
    { label: 'add9', suffix: 'add9' },
];

export function ChordAlterationMenu({ baseChord, onSelect, onClose, position }: ChordAlterationMenuProps) {
    // Parse base chord to remove existing quality if needed?
    // Ideally baseChord is clean degree like "1" or "6".
    // But toolbar sends "1", "6m".

    const handleSelect = (quality: string) => {
        // If base has 'm' (minor) and we invite '7', result is 'm7'.
        // If base has 'm' and we invite 'maj7', result is 'mmaj7' (rare but existing).

        // Simplification: strip existing quality?
        // Let's just append for now, or use logic.
        // If base is "6m", suffix "7" should make "6m7".
        // If base is "1", suffix "7" makes "17" (dom7).

        // Actually, usually we replace quality. 
        // But "m" is part of the base identity in Nashville for minors (6m).
        // Let's assume onSelect replaces the whole chord string.

        let result = baseChord;
        if (baseChord.endsWith('m') && quality.startsWith('m')) {
            // e.g. 6m + m7 -> 6m7
            result = baseChord.slice(0, -1) + quality;
        } else {
            result = baseChord + quality;
        }

        onSelect(result);
    };

    return (
        <>
            <div className={styles.menuBackdrop} onClick={onClose} />
            <div
                className={styles.alterationMenu}
                style={{ top: position.y, left: position.x }}
            >
                <div className={styles.menuGrid}>
                    {COMMON_ALTERATIONS.map(alt => (
                        <button
                            key={alt.suffix}
                            className={styles.menuButton}
                            onClick={() => handleSelect(alt.suffix)}
                        >
                            {baseChord}{alt.suffix}
                        </button>
                    ))}
                </div>
                <div className={styles.menuInputRow}>
                    {/* Custom input placeholder */}
                    <input
                        className={styles.menuInput}
                        placeholder="Custom..."
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                onSelect(baseChord + e.currentTarget.value);
                            }
                        }}
                    />
                </div>
            </div>
        </>
    );
}
