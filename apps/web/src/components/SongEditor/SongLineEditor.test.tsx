import { render, screen, fireEvent } from '@testing/library/react';
import { SongLineEditor } from './SongLineEditor';
import { DraggedChord } from './types';

describe('SongLineEditor', () => {
    const defaultProps = {
        lineText: '[C]Amazing [G]grace',
        partIndex: 0,
        lineIndex: 0,
        currentKey: 'C' as const,
        chordStyle: 'letters' as const,
        lyricsLocked: false,
        draggedChord: null,
        isDropTarget: false,
        dropCharIndex: null,
        onTextChange: jest.fn(),
        onKeyDown: jest.fn(),
        onDropPositionChange: jest.fn(),
        onChordDrop: jest.fn(),
        onChordDragStart: jest.fn(),
        onChordDragEnd: jest.fn(),
    };

    it('renders chords above text', () => {
        const { container } = render(<SongLineEditor {...defaultProps} />);

        const chordRow = container.querySelector('.chordRow');
        const textRow = container.querySelector('.textRow');

        expect(chordRow).toBeInTheDocument();
        expect(textRow).toBeInTheDocument();

        // Chords should be in chord row
        const chordBadges = container.querySelectorAll('.chordBadge');
        expect(chordBadges).toHaveLength(2);
        expect(chordBadges[0]).toHaveTextContent('C');
        expect(chordBadges[1]).toHaveTextContent('G');

        // Text row should contain pure text
        expect(textRow).toHaveTextContent('Amazing grace');
    });

    it('positions chords at correct character positions', () => {
        const { container } = render(<SongLineEditor {...defaultProps} />);

        const chordBadges = container.querySelectorAll('.chordBadge');

        // First chord at position 0
        expect(chordBadges[0]).toHaveStyle({ left: '0ch' });

        // Second chord at position 8 (after "Amazing ")
        expect(chordBadges[1]).toHaveStyle({ left: '8ch' });
    });

    it('hides caret when not dragging', () => {
        const { container } = render(<SongLineEditor {...defaultProps} />);

        const caret = container.querySelector('.dropCaret');
        expect(caret).not.toBeInTheDocument();
    });

    it('shows caret only when actively dragging', () => {
        const draggedChord: DraggedChord = {
            chord: '1',
            source: 'toolbar',
        };

        const { container } = render(
            <SongLineEditor
                {...defaultProps}
                draggedChord={draggedChord}
                isDropTarget={true}
                dropCharIndex={5}
            />
        );

        const caret = container.querySelector('.dropCaret');
        expect(caret).toBeInTheDocument();
        expect(caret).toHaveStyle({ left: '5ch' });
    });

    it('applies dragging class to chord being dragged', () => {
        const { container } = render(<SongLineEditor {...defaultProps} />);

        const firstChord = container.querySelectorAll('.chordBadge')[0];

        // Simulate drag start
        fireEvent.dragStart(firstChord);

        expect(firstChord).toHaveClass('dragging');
    });

    it('removes dragging class on drag end', () => {
        const { container } = render(<SongLineEditor {...defaultProps} />);

        const firstChord = container.querySelectorAll('.chordBadge')[0];

        // Simulate drag start and end
        fireEvent.dragStart(firstChord);
        fireEvent.dragEnd(firstChord);

        expect(firstChord).not.toHaveClass('dragging');
    });

    it('calls onChordDragStart with correct data', () => {
        const onChordDragStart = jest.fn();
        const { container } = render(
            <SongLineEditor {...defaultProps} onChordDragStart={onChordDragStart} />
        );

        const firstChord = container.querySelectorAll('.chordBadge')[0];
        fireEvent.dragStart(firstChord);

        expect(onChordDragStart).toHaveBeenCalledWith({
            chord: '1', // Nashville notation
            source: 'line',
            originalLineIndex: 0,
            originalCharIndex: 0,
        });
    });

    it('calculates drop position based on mouse position', () => {
        const onDropPositionChange = jest.fn();
        const { container } = render(
            <SongLineEditor {...defaultProps} onDropPositionChange={onDropPositionChange} />
        );

        const line = container.querySelector('.line');

        // Simulate drag over at position
        fireEvent.dragOver(line!, {
            clientX: 100,
        });

        // Should call with calculated character index
        expect(onDropPositionChange).toHaveBeenCalled();
    });

    it('allows text editing when lyrics not locked', () => {
        const onTextChange = jest.fn();
        const { container } = render(
            <SongLineEditor {...defaultProps} onTextChange={onTextChange} />
        );

        const textElement = container.querySelector('.lineText');
        expect(textElement).toHaveAttribute('contenteditable', 'true');
    });

    it('prevents text editing when lyrics locked', () => {
        const { container } = render(
            <SongLineEditor {...defaultProps} lyricsLocked={true} />
        );

        const textElement = container.querySelector('.lineText');
        expect(textElement).toHaveAttribute('contenteditable', 'false');
    });
});
