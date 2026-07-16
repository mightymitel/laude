/**
 * The chord-placement loupe (WP-166 / DEC-143): a magnifier floated above
 * the touch point — the finger occludes the drop target — rendering a CARET
 * at the exact inter-character insertion point. Per DEC-141 it is the
 * rendering core re-invoked on the current line at higher scale (via
 * lineToSegments), clipped to a capsule — NOT a DOM/canvas snapshot.
 *
 * Behavior per Android's Magnifier spec: follows the finger horizontally,
 * vertically pinned above the current line, dismissed by the drag layer
 * when the touch leaves the line's bounds; the drag layer only shows it for
 * coarse (touch) pointers, where the finger actually occludes.
 */
import type { ChordStyle, Key } from '@laudasist/shared'
import { lineToSegments } from '@/rendering/core'
import styles from './SongEditor.module.css'

export interface LoupeState {
    /** Pointer position (viewport coords) the loupe floats above. */
    x: number
    y: number
    /** The stored line text (with chord tokens). */
    lineText: string
    /** Line-global char index of the insertion caret. */
    caretIndex: number
    /** The chord being placed (already display-formatted). */
    chordDisplay: string
}

const SCALE = 1.8
const WIDTH = 240
const HEIGHT = 64

export function ChordLoupe({ state, currentKey, chordStyle }: {
    state: LoupeState
    currentKey: Key
    chordStyle: ChordStyle
}) {
    const { pureText, segments } = lineToSegments(state.lineText, currentKey, chordStyle)
    const before = pureText.slice(0, state.caretIndex)
    const after = pureText.slice(state.caretIndex)
    const chordRow = segments
        .flatMap((s) => s.chords.map((c) => ({ index: c.index, display: c.display })))
        .sort((a, b) => a.index - b.index)

    // Keep the caret centered: shift the magnified content left by the
    // caret's approximate x within the zoomed text.
    const approxCharPx = 9.6 * SCALE // monospace-ish estimate at the loupe font
    const shift = Math.max(0, before.length * approxCharPx - WIDTH / 2)

    return (
        <div
            className={styles.loupe}
            data-testid="chord-loupe"
            style={{
                position: 'fixed',
                left: Math.max(8, Math.min(state.x - WIDTH / 2, window.innerWidth - WIDTH - 8)),
                top: Math.max(8, state.y - HEIGHT - 36),
                width: WIDTH,
                height: HEIGHT,
                zIndex: 400,
                pointerEvents: 'none',
            }}
        >
            <div className={styles.loupeContent} style={{ transform: `translateX(${-shift}px)` }}>
                <div className={styles.loupeChords} style={{ fontSize: `${0.8 * SCALE}rem` }}>
                    {chordRow.map((c, i) => (
                        <span key={i} style={{ position: 'absolute', left: c.index * approxCharPx }}>
                            {c.display}
                        </span>
                    ))}
                </div>
                <div className={styles.loupeText} style={{ fontSize: `${0.95 * SCALE}rem` }}>
                    <span>{before}</span>
                    <span className={styles.loupeCaret} data-chord={state.chordDisplay} />
                    <span>{after}</span>
                </div>
            </div>
        </div>
    )
}
