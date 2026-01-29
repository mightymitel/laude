import { Arrangement, SongPart } from '@laudasist/shared';

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
    arrangements: _arrangements,
    parts: _parts,
    defaultArrangement: _defaultArrangement,
    onAddArrangement: _onAddArrangement,
    onUpdateArrangement: _onUpdateArrangement,
    onRemoveArrangement: _onRemoveArrangement,
    onReferencePart: _onReferencePart,
}: ArrangementPanelProps) {

    // Simplified view for now - just list them
    // TODO: Full drag-drop arrangement editing

    return (
        <div style={{ marginTop: '2rem', borderTop: '1px solid #333', paddingTop: '1rem' }}>
            <h3>Arrangements</h3>
            <p style={{ color: '#888', fontSize: '0.8rem' }}>Coming in Phase 2...</p>
        </div>
    );
}
