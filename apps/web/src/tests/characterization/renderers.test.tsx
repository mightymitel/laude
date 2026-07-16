/**
 * WP-164 (DEC-142): CHARACTERIZATION of the current renderers, captured
 * BEFORE the shared-core extraction. These snapshots are the known-good
 * reference the new core must reproduce. Any intentional divergence is an
 * explicit, reviewed snapshot update — never a silent one.
 *
 * What is characterized is the LOGICAL layout — segmentation, chord
 * spellings, positions — not pixels: rendering (fonts, zoom, CSS) is
 * per-device by design (DEC-120); content must be invariant.
 *
 * Engine A: useSongLineSegments (song view + session overview via SongLine).
 * Engine B: viewports/chordLine renderLine + formatChordToken (viewports +
 *           owner Play mode), incl. the capo shape-key composition.
 * Engine C: SongLine's three chord positions as class-stripped static markup
 *           (structure may legitimately change with the core — that update
 *           must be reviewed against these baselines).
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Key, ChordStyle } from '@laudasist/shared'
import { transposeKeyName } from '@laude/chords'
import { useSongLineSegments } from '@/hooks/useSongLineSegments'
import { formatChordToken, renderLine, stripChordTokens } from '@/viewports/chordLine'
import { SongLine } from '@/components/songs/SongLine'

// Tricky-on-purpose fixture lines: minors, slash/borrowed degrees, RO
// diacritics, stacked chords, late first chord (compact '_' rule), no
// chords, empty, and a malformed token (fallback path).
const LINES = [
    '[1]Amazing [4]grace how [5]sweet the [1]sound',
    'That [6m]saved a [4]wretch like [5/7]me',
    'Prea[b7]mărit să [4m]fii, [2m]Doamne',
    'The Lord has promised good to me',
    '[1][4]Stacked chords on one syllable',
    'Trailing tail with a late chord som[5]ewhere past column ten',
    '',
    '[unknown]weird token line',
] as const

const KEYS: Key[] = ['G', 'F#', 'Bb', 'C']
const STYLES: ChordStyle[] = ['letters', 'nashville', 'roman', 'caseSensitive']
const NOTATIONS = ['english', 'german', 'solfege', 'nashville'] as const
const CAPOS = [0, 2, 4] as const

/** Call the hook exactly as React would — via a probe render. */
function segmentsOf(line: string, key: Key, style: ChordStyle) {
    let captured: unknown = null
    function Probe() {
        captured = useSongLineSegments(line, key, style)
        return null
    }
    renderToStaticMarkup(<Probe />)
    return captured
}

describe('engine A — useSongLineSegments (song view / session overview)', () => {
    for (const key of KEYS) {
        for (const style of STYLES) {
            it(`segments · key=${key} · style=${style}`, () => {
                const out = LINES.map((line) => ({ line, result: segmentsOf(line, key, style) }))
                expect(out).toMatchSnapshot()
            })
        }
    }
})

describe('engine B — viewports renderLine (+ capo shape keys)', () => {
    for (const key of KEYS) {
        for (const notation of NOTATIONS) {
            for (const capo of CAPOS) {
                it(`renderLine · key=${key} · notation=${notation} · capo=${capo}`, () => {
                    const shapeKey = capo > 0 ? transposeKeyName(key, -capo) : key
                    const out = LINES.map((line) => ({
                        line,
                        shapeKey,
                        rendered: renderLine(line, shapeKey, notation),
                    }))
                    expect(out).toMatchSnapshot()
                })
            }
        }
    }

    it('formatChordToken spellings across the degree vocabulary', () => {
        const tokens = ['1', '4', '5', '6m', '2m', 'b7', '4m', '5/7', 'b2', 'D', 'F#m']
        const out = KEYS.flatMap((key) =>
            NOTATIONS.map((notation) => ({
                key,
                notation,
                spellings: tokens.map((t) => `${t}→${formatChordToken(t, key, notation)}`),
            })),
        )
        expect(out).toMatchSnapshot()
    })

    it('stripChordTokens strips every token shape', () => {
        expect(LINES.map((l) => stripChordTokens(l))).toMatchSnapshot()
    })
})

describe('engine C — SongLine markup (above / inline / compact), class-stripped', () => {
    const stripClasses = (html: string) => html.replace(/ class="[^"]*"/g, '')
    for (const position of ['above', 'inline', 'compact'] as const) {
        it(`SongLine · position=${position} · key=G · letters`, () => {
            const out = LINES.map((line) => ({
                line,
                html: stripClasses(
                    renderToStaticMarkup(
                        <SongLine text={line} displayKey="G" chordStyle="letters" chordPosition={position} />,
                    ),
                ),
            }))
            expect(out).toMatchSnapshot()
        })
    }
})
