import { useState } from 'react';
import { PartType } from '@laudasist/shared';
import styles from './SongEditor.module.css';

interface PartManagerProps {
    onAddPart: (type: PartType) => void;
}

const PART_TYPES: PartType[] = [
    'verse', 'chorus', 'bridge', 'pre-chorus', 'intro', 'outro', 'tag'
];

export function PartManager({ onAddPart }: PartManagerProps) {
    const [selectedType, setSelectedType] = useState<PartType>('verse');
    const [isExpanded, setIsExpanded] = useState(false);

    const handleAdd = () => {
        onAddPart(selectedType);
        setIsExpanded(false);
    };

    if (!isExpanded) {
        return (
            <button
                className={styles.addPartButton}
                onClick={() => setIsExpanded(true)}
            >
                + Add Part
            </button>
        );
    }

    return (
        <div className={styles.partManagerExpanded}>
            <div className={styles.partTypeGrid}>
                {PART_TYPES.map(type => (
                    <button
                        key={type}
                        className={`${styles.typeButton} ${selectedType === type ? styles.active : ''}`}
                        onClick={() => setSelectedType(type)}
                    >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                ))}
            </div>

            <div className={styles.partManagerActions}>
                <button
                    className={styles.buttonSecondary}
                    onClick={() => setIsExpanded(false)}
                >
                    Cancel
                </button>
                <button
                    className={styles.buttonPrimary}
                    onClick={handleAdd}
                >
                    Add {selectedType}
                </button>
            </div>
        </div>
    );
}
