import { useState } from 'react';
import { Arrangement, SongPart } from '@laudasist/shared';
import styles from './SongEditor.module.css';

interface ArrangementPanelProps {
    arrangements: Arrangement[];
    parts: SongPart[];
    defaultArrangement: string[];
    onAddArrangement: (name: string) => void;
    onUpdateArrangement: (index: number, arrangement: Arrangement) => void;
    onRemoveArrangement: (index: number) => void;
    onReferencePart: (partId: string) => void; // Add part ID to current arrangement
}

export function ArrangementPanel({
    arrangements,
    parts,
    defaultArrangement,
    onAddArrangement,
    onUpdateArrangement,
    onRemoveArrangement,
    onReferencePart,
}: ArrangementPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [newArrangementName, setNewArrangementName] = useState('');

    // Simplified view for now - just list them
    // TODO: Full drag-drop arrangement editing

    return (
        <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
            <h3>Arrangements</h3>
            <p style={{ color: '#888', fontSize: '0.8rem' }}>Coming in Phase 2...</p>
        </div>
    );
}
