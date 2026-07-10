/**
 * Fit-to-viewport (WP-148): scale + centre the rendered slice so it fills
 * the container edge-to-edge with no scrolling — projector, laptop, phone.
 * Measurement-based (transform: scale), converging in a few passes; content
 * lays out at the container's width so lines wrap naturally, then the whole
 * block scales to fill the height (up or down), re-widening as it shrinks.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const MIN_SCALE = 0.35
const MAX_SCALE = 2.2

export function FitBox({ children, fitKey }: { children: ReactNode; fitKey: string }) {
    const outerRef = useRef<HTMLDivElement | null>(null)
    const innerRef = useRef<HTMLDivElement | null>(null)
    const [scale, setScale] = useState(1)

    useLayoutEffect(() => {
        const outer = outerRef.current
        const inner = innerRef.current
        if (!outer || !inner) return

        const measure = () => {
            const ow = outer.clientWidth
            const oh = outer.clientHeight
            if (ow === 0 || oh === 0) return
            // Content at width ow/s re-wraps as s changes, so scaled height
            // is monotone in s — binary-search the largest s that fits
            // (fixed-point iteration oscillates on narrow columns).
            const fits = (s: number): boolean => {
                inner.style.width = `${Math.round(ow / s)}px`
                return inner.scrollHeight * s <= oh
            }
            let lo = MIN_SCALE
            let hi = MAX_SCALE
            if (!fits(lo)) {
                hi = lo // give up shrinking further; clamp at MIN
            } else {
                for (let i = 0; i < 8; i++) {
                    const mid = (lo + hi) / 2
                    if (fits(mid)) lo = mid
                    else hi = mid
                }
            }
            const s = lo
            inner.style.width = `${Math.round(ow / s)}px`
            setScale(s)
        }

        measure()
        // Observe BOTH boxes: the outer for viewport resizes, the inner for
        // late content growth (font swap, async lines) — rAF-coalesced so the
        // observer can't loop on its own width writes.
        let raf = 0
        const schedule = () => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(measure)
        }
        const ro = new ResizeObserver(schedule)
        ro.observe(outer)
        ro.observe(inner)
        if (document.fonts !== undefined) {
            void document.fonts.ready.then(schedule)
        }
        return () => {
            ro.disconnect()
            cancelAnimationFrame(raf)
        }
        // fitKey encodes everything that changes the content's natural size.
    }, [fitKey])

    return (
        <div
            ref={outerRef}
            style={{
                flex: 1,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 0,
            }}
        >
            <div ref={innerRef} style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
                {children}
            </div>
        </div>
    )
}
