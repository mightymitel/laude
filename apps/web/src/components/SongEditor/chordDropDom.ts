// DOM measurement helpers for touch-based chord drag & drop: translate touch
// coordinates into a { partIndex, lineIndex, charIndex } drop position by
// inspecting the rendered lyric line/segment elements.
import { DropPosition } from './types';

function parseLineIndices(lineElement: HTMLElement): { partIndex: number; lineIndex: number } {
    return {
        partIndex: parseInt(lineElement.dataset.partIndex || '0', 10),
        lineIndex: parseInt(lineElement.dataset.lineIndex || '0', 10),
    };
}

function segmentStartIndex(segmentText: Element): number {
    const segmentEl = segmentText.closest('[data-start-index]');
    return segmentEl instanceof HTMLElement ? parseInt(segmentEl.dataset.startIndex || '0', 10) : 0;
}

function charIndexInSegment(segmentText: Element, x: number): number {
    const rect = segmentText.getBoundingClientRect();
    const relX = x - rect.left;
    const text = segmentText.textContent || '';
    const charWidth = text.length > 0 ? rect.width / text.length : 10;
    return Math.max(0, Math.min(Math.round(relX / charWidth), text.length));
}

/**
 * Compute the drop position while a touch drag hovers over the editor.
 * Returns null when the touch is not over a lyric line (the caller keeps
 * the previous drop position in that case).
 */
export function getTouchDropPosition(x: number, y: number): DropPosition | null {
    const elementUnderTouch = document.elementFromPoint(x, y);
    if (!elementUnderTouch) return null;

    // Find the line element
    const lineElement = elementUnderTouch.closest('[data-part-index][data-line-index]');
    if (!(lineElement instanceof HTMLElement)) return null;

    const { partIndex, lineIndex } = parseLineIndices(lineElement);

    // Find the segment text element to calculate character position
    const segments = lineElement.querySelectorAll('[class*="segmentText"]');
    let bestCharIndex = 0;
    let foundSegment = false;

    // Check each segment to find which one the touch is over
    for (let i = 0; i < segments.length; i++) {
        const segmentText = segments[i];
        const rect = segmentText.getBoundingClientRect();

        // Check if touch is within this segment's bounds
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            bestCharIndex = segmentStartIndex(segmentText) + charIndexInSegment(segmentText, x);
            foundSegment = true;
            break;
        }
    }

    // If touch is over the line but not directly over a segment, use the first or last position
    if (!foundSegment && segments.length > 0) {
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];
        const firstRect = firstSegment.getBoundingClientRect();
        const lastRect = lastSegment.getBoundingClientRect();

        if (x < firstRect.left) {
            bestCharIndex = 0;
        } else if (x > lastRect.right) {
            // Get the end position of the last segment
            const text = lastSegment.textContent || '';
            bestCharIndex = segmentStartIndex(lastSegment) + text.length;
        }
    }

    return { partIndex, lineIndex, charIndex: bestCharIndex };
}

/**
 * Compute the drop position when a touch drag is released over an element.
 * Returns null when the drop target is not a lyric line.
 */
export function getTouchDropTargetPosition(target: Element, touchX: number): DropPosition | null {
    const lineElement = target.closest('[data-part-index][data-line-index]');
    if (!(lineElement instanceof HTMLElement)) return null;

    const { partIndex, lineIndex } = parseLineIndices(lineElement);

    // Calculate character position based on touch position
    const segmentText = lineElement.querySelector('[class*="segmentText"]');
    if (!segmentText) return null;

    return { partIndex, lineIndex, charIndex: charIndexInSegment(segmentText, touchX) };
}
