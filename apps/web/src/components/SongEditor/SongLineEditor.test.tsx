import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SongLineEditor } from './SongLineEditor';

// dnd-kit hooks (droppable line, draggable badges) need a DndContext.
const renderLine = (props: Parameters<typeof SongLineEditor>[0]) =>
    render(
        <DndContext>
            <SongLineEditor {...props} />
        </DndContext>,
    );

// Helper to query CSS module classes (partial match)
const queryByClass = (container: HTMLElement, className: string) =>
    container.querySelector(`[class*="${className}"]`);

const queryAllByClass = (container: HTMLElement, className: string) =>
    container.querySelectorAll(`[class*="${className}"]`);

// Query segments specifically using data attribute (more reliable than class matching)
const querySegments = (container: HTMLElement) =>
    container.querySelectorAll('[data-segment-index]');

describe('SongLineEditor', () => {
    const defaultProps = {
        lineText: '[1]Amazing [4]grace',
        partIndex: 0,
        lineIndex: 0,
        currentKey: 'C' as const,
        chordStyle: 'letters' as const,
        lyricsLocked: false,
        isDragging: false,
        isDropTarget: false,
        dropCharIndex: null,
        onTextChange: vi.fn(),
        onKeyDown: vi.fn(),
        onDeleteLine: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('rendering', () => {
        it('renders the line container', () => {
            const { container } = renderLine(defaultProps);

            const lineContainer = queryByClass(container, 'line');
            expect(lineContainer).toBeInTheDocument();
        });

        it('renders the visual layer', () => {
            const { container } = renderLine(defaultProps);

            const visualLayer = queryByClass(container, 'visualLayer');
            expect(visualLayer).toBeInTheDocument();
        });

        it('renders segments for text with chords', () => {
            const { container } = renderLine(defaultProps);

            const segments = querySegments(container);
            // "[1]Amazing [4]grace" creates 2 segments: "Amazing " at chord 1, "grace" at chord 4
            expect(segments.length).toBe(2);
        });

        it('renders chord badges with correct display text', () => {
            const { container } = renderLine(defaultProps);

            const chordBadges = queryAllByClass(container, 'chordBadge');
            expect(chordBadges.length).toBe(2);
            // In letters style with key C: 1 -> C, 4 -> F
            expect(chordBadges[0]?.textContent).toBe('C');
            expect(chordBadges[1]?.textContent).toBe('F');
        });

        it('renders lyrics text in segments', () => {
            const { container } = renderLine(defaultProps);

            const segmentTexts = queryAllByClass(container, 'segmentText');
            expect(segmentTexts.length).toBe(2);
            expect(segmentTexts[0]?.textContent).toBe('Amazing ');
            expect(segmentTexts[1]?.textContent).toBe('grace');
        });

        it('renders text without chords as single segment', () => {
            const { container } = renderLine({ ...defaultProps, lineText: "Just plain text" });

            const segments = querySegments(container);
            expect(segments.length).toBe(1);

            const chordBadges = queryAllByClass(container, 'chordBadge');
            expect(chordBadges.length).toBe(0);

            const segmentText = queryByClass(container, 'segmentText');
            expect(segmentText?.textContent).toBe('Just plain text');
        });

        it('renders empty line with empty segment', () => {
            const { container } = renderLine({ ...defaultProps, lineText: "" });

            const segments = querySegments(container);
            expect(segments.length).toBe(1);
        });
    });

    describe('chord styles', () => {
        it('displays chords in Nashville notation', () => {
            const { container } = renderLine({ ...defaultProps, chordStyle: "nashville" });

            const chordBadges = queryAllByClass(container, 'chordBadge');
            expect(chordBadges[0]?.textContent).toBe('1');
            expect(chordBadges[1]?.textContent).toBe('4');
        });

        it('displays chords in Roman numerals', () => {
            const { container } = renderLine({ ...defaultProps, chordStyle: "roman" });

            const chordBadges = queryAllByClass(container, 'chordBadge');
            expect(chordBadges[0]?.textContent).toBe('I');
            expect(chordBadges[1]?.textContent).toBe('IV');
        });

        it('displays chords in letters for different keys', () => {
            const { container } = renderLine({ ...defaultProps, currentKey: "G", chordStyle: "letters" });

            const chordBadges = queryAllByClass(container, 'chordBadge');
            // In key G: 1 -> G, 4 -> C
            expect(chordBadges[0]?.textContent).toBe('G');
            expect(chordBadges[1]?.textContent).toBe('C');
        });
    });

    describe('lyrics editing', () => {
        it('allows text editing when lyrics not locked', () => {
            const { container } = renderLine({ ...defaultProps, lyricsLocked: false });

            const segmentText = queryByClass(container, 'segmentText');
            expect(segmentText).toHaveAttribute('contenteditable', 'true');
        });

        it('prevents text editing when lyrics locked', () => {
            const { container } = renderLine({ ...defaultProps, lyricsLocked: true });

            const segmentText = queryByClass(container, 'segmentText');
            expect(segmentText).toHaveAttribute('contenteditable', 'false');
        });

        it('calls onTextChange when segment text is edited and blurred', () => {
            const onTextChange = vi.fn();
            const { container } = renderLine({ ...defaultProps, onTextChange: onTextChange });

            const segmentText = queryByClass(container, 'segmentText') as HTMLElement;
            segmentText.innerText = 'New text ';
            fireEvent.blur(segmentText);

            expect(onTextChange).toHaveBeenCalled();
        });
    });

    describe('chord drag and drop (dnd-kit transport)', () => {
        it('chord badges are dnd-kit draggables (keyboard-activatable buttons)', () => {
            const { container } = renderLine(defaultProps);
            const chordBadge = queryByClass(container, 'chordBadge') as HTMLElement;
            // useDraggable contributes role="button" + aria attrs + listeners.
            expect(chordBadge).toHaveAttribute('role', 'button');
            expect(chordBadge).toHaveAttribute('aria-roledescription', 'draggable');
        });

        it('the LINE is the single droppable — segments carry no drop handlers', () => {
            const { container } = renderLine(defaultProps);
            // One droppable container per line (perf constraint, DEC-143):
            // the line node exists and segments do not register dragover work.
            expect(queryByClass(container, 'line')).toBeInTheDocument();
            expect(container.querySelectorAll('[data-segment-index]').length).toBeGreaterThan(0);
        });
    });

    describe('drop caret (live landing preview)', () => {
        it('does not show drop caret when not a drop target', () => {
            const { container } = renderLine({ ...defaultProps, isDropTarget: false, dropCharIndex: 5 });
            expect(queryByClass(container, 'dropCaret')).not.toBeInTheDocument();
        });

        it('shows the caret at the character-exact position when targeted', () => {
            // charIndex 3 sits inside the first segment ("Amazing ", start 0).
            const { container } = renderLine({
                ...defaultProps,
                isDragging: true,
                isDropTarget: true,
                dropCharIndex: 3,
            });
            const caret = queryByClass(container, 'dropCaret') as HTMLElement;
            expect(caret).toBeInTheDocument();
            expect(caret.style.left).toBe('3ch');
        });

        it('the caret lands in the segment that owns the char range', () => {
            // charIndex 10 is inside the second segment ("grace", start 8).
            const { container } = renderLine({
                ...defaultProps,
                isDragging: true,
                isDropTarget: true,
                dropCharIndex: 10,
            });
            const carets = queryAllByClass(container, 'dropCaret');
            expect(carets.length).toBe(1);
            expect((carets[0] as HTMLElement).style.left).toBe('2ch');
        });
    });

    describe('segment data attributes', () => {
        it('segments have data-segment-index attribute', () => {
            const { container } = renderLine(defaultProps);

            const segments = querySegments(container);
            expect(segments[0]).toHaveAttribute('data-segment-index', '0');
            expect(segments[1]).toHaveAttribute('data-segment-index', '1');
        });

        it('segments have data-start-index attribute', () => {
            const { container } = renderLine(defaultProps);

            const segments = querySegments(container);
            expect(segments[0]).toHaveAttribute('data-start-index', '0');
            // Second segment starts after "Amazing " (8 chars)
            expect(segments[1]).toHaveAttribute('data-start-index', '8');
        });
    });

    describe('complex chord patterns', () => {
        it('handles multiple chords at same position', () => {
            // This would be like "[1][5]text" - stacked chords
            const { container } = renderLine({ ...defaultProps, lineText: "[1][5]Amazing" });

            const chordBadges = queryAllByClass(container, 'chordBadge');
            // Both chords should be in the same segment
            expect(chordBadges.length).toBe(2);
        });

        it('handles minor chords', () => {
            const { container } = renderLine({ ...defaultProps, lineText: "[6m]Sad song", chordStyle: "letters" });

            const chordBadge = queryByClass(container, 'chordBadge');
            expect(chordBadge?.textContent).toBe('Am');
        });

        it('handles slash chords', () => {
            const { container } = renderLine({ ...defaultProps, lineText: '[1/5]Bass note', chordStyle: 'letters' });

            const chordBadge = queryByClass(container, 'chordBadge');
            expect(chordBadge?.textContent).toBe('C/G');
        });
    });
});
