/**
 * Character-exact drop offset (WP-166 / DEC-143): map a pointer position
 * inside a lyric-line container to a char index in the line's pure text via
 * the browser caret-from-point APIs — replacing the old uniform char-width
 * estimation. Segments carry data-start-index, so a segment-local text
 * offset maps to the line-global index.
 */

interface CaretHit {
    node: Node
    offset: number
}

function caretAt(x: number, y: number): CaretHit | null {
    // Standard API first, WebKit legacy second.
    const doc = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
        caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    if (typeof doc.caretPositionFromPoint === 'function') {
        const pos = doc.caretPositionFromPoint(x, y)
        return pos ? { node: pos.offsetNode, offset: pos.offset } : null
    }
    if (typeof doc.caretRangeFromPoint === 'function') {
        const range = doc.caretRangeFromPoint(x, y)
        return range ? { node: range.startContainer, offset: range.startOffset } : null
    }
    return null
}

function segmentStartOf(node: Node): { start: number; segmentEl: HTMLElement } | null {
    const el = node instanceof HTMLElement ? node : node.parentElement
    const segmentEl = el?.closest('[data-start-index]')
    if (!(segmentEl instanceof HTMLElement)) return null
    return { start: parseInt(segmentEl.dataset.startIndex || '0', 10), segmentEl }
}

/** Fallback when caret APIs miss (or land outside text): char-width estimate. */
function estimateInSegment(segmentEl: HTMLElement, x: number): number {
    const textEl = segmentEl.querySelector('[class*="segmentText"]') ?? segmentEl
    const rect = textEl.getBoundingClientRect()
    const text = textEl.textContent ?? ''
    if (text.length === 0) return 0
    const charWidth = rect.width / text.length
    return Math.max(0, Math.min(Math.round((x - rect.left) / charWidth), text.length))
}

/**
 * The line-global char index for a pointer over a line container, or null
 * when the pointer isn't over any of its segments.
 */
export function charIndexFromPoint(lineContainer: HTMLElement, x: number, y: number): number | null {
    const hit = caretAt(x, y)
    if (hit && lineContainer.contains(hit.node)) {
        const seg = segmentStartOf(hit.node)
        if (seg) {
            // Only text-node offsets are character counts; element hits fall
            // through to estimation on the segment we did identify.
            if (hit.node.nodeType === Node.TEXT_NODE) return seg.start + hit.offset
            return seg.start + estimateInSegment(seg.segmentEl, x)
        }
    }
    // Pointer over the line but between/outside segments: nearest segment.
    const segments = lineContainer.querySelectorAll<HTMLElement>('[data-start-index]')
    let best: { start: number; el: HTMLElement; dist: number } | null = null
    for (const el of segments) {
        const rect = el.getBoundingClientRect()
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
        const dist = dx + dy
        if (best === null || dist < best.dist) {
            best = { start: parseInt(el.dataset.startIndex || '0', 10), el, dist }
        }
    }
    if (!best) return null
    return best.start + estimateInSegment(best.el, x)
}
