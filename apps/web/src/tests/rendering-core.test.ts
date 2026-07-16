/**
 * WP-165: the core's render-by-part model (DEC-147) — parts laid out once,
 * arrangement = ordered refs with REPEATS, capo composition, ref resolution.
 * (Line-level layout is covered by the WP-164 characterization goldens.)
 */
import { describe, expect, it } from 'vitest'
import type { Song } from '@laudasist/shared'
import { layoutSong, officialArrangementOf, refToPartIndex, sequenceOf } from '@/rendering/core'

const SONG: Song = {
    id: 's1',
    title: 'Repeats',
    defaultKey: 'G',
    defaultArrangement: ['V1', 'C1', 'V2', 'C1', 'B1', 'C1', 'C1'],
    arrangements: [],
    parts: [
        { id: 'p1', type: 'verse', index: 1, lines: [{ text: '[1]verse one' }] },
        { id: 'p2', type: 'chorus', index: 1, lines: [{ text: '[4]the chorus' }] },
        { id: 'p3', type: 'verse', index: 2, lines: [{ text: '[1]verse two' }] },
        { id: 'p4', type: 'bridge', index: 1, lines: [{ text: '[6m]the bridge' }] },
    ],
    tags: [],
    libraryType: 'user',
    ownerId: 'u',
    visibility: 'private',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: 'u',
}

describe('refToPartIndex', () => {
    it('resolves type letters + ordinals against part indexes', () => {
        expect(refToPartIndex(SONG.parts, 'V1')).toBe(0)
        expect(refToPartIndex(SONG.parts, 'C1')).toBe(1)
        expect(refToPartIndex(SONG.parts, 'V2')).toBe(2)
        expect(refToPartIndex(SONG.parts, 'B1')).toBe(3)
        expect(refToPartIndex(SONG.parts, 'X9')).toBeNull()
        expect(refToPartIndex(SONG.parts, 'V9')).toBeNull()
    })
})

describe('sequenceOf', () => {
    it('arrangement view: repeats reference the SAME part with occurrence numbers', () => {
        const seq = sequenceOf(SONG.parts, 'arrangement', SONG.defaultArrangement)
        expect(seq.map((o) => o.part)).toEqual([0, 1, 2, 1, 3, 1, 1])
        // The chorus (part 1) appears 4×, occurrences 1..4 — the addressing
        // repeats need (the audit's Q4 gap lives at the SESSION layer).
        expect(seq.filter((o) => o.part === 1).map((o) => o.occurrence)).toEqual([1, 2, 3, 4])
    })

    it('compact view: each part exactly once, in canonical order', () => {
        const seq = sequenceOf(SONG.parts, 'compact', SONG.defaultArrangement)
        expect(seq.map((o) => o.part)).toEqual([0, 1, 2, 3])
    })

    it('an arrangement of only-unresolvable refs degrades to compact, never empty', () => {
        const seq = sequenceOf(SONG.parts, 'arrangement', ['Z1', 'Q3'])
        expect(seq.map((o) => o.part)).toEqual([0, 1, 2, 3])
    })
})

describe('layoutSong', () => {
    it('lays out parts ONCE; the sequence reuses them', () => {
        const layout = layoutSong(SONG, {
            key: 'G',
            format: { kind: 'notation', id: 'english' },
            view: 'arrangement',
        })
        expect(layout.parts).toHaveLength(4)
        expect(layout.sequence).toHaveLength(7)
        expect(layout.parts[1]!.lines[0]!.chords[0]!.display).toBe('C') // degree 4 in G
    })

    it('capo composes the shape key; sounding key is preserved', () => {
        const layout = layoutSong(SONG, {
            key: 'G',
            capo: 2,
            format: { kind: 'notation', id: 'english' },
        })
        expect(layout.soundingKey).toBe('G')
        expect(layout.renderKey).toBe('F')
        expect(layout.parts[0]!.lines[0]!.chords[0]!.display).toBe('F') // degree 1 in F shapes
    })

    it('showChords: false strips chords but keeps text', () => {
        const layout = layoutSong(SONG, {
            key: 'G',
            format: { kind: 'style', style: 'letters' },
            showChords: false,
        })
        expect(layout.parts[0]!.lines[0]!.text).toBe('verse one')
        expect(layout.parts[0]!.lines[0]!.chords).toEqual([])
    })
})

describe('officialArrangementOf', () => {
    it('prefers defaultArrangement, falls back to the isDefault arrangement, else undefined', () => {
        expect(officialArrangementOf(SONG)).toEqual(SONG.defaultArrangement)
        const viaMarked: Song = {
            ...SONG,
            defaultArrangement: [],
            arrangements: [{ id: 'a', name: 'Official', order: ['C1', 'V1'], isDefault: true }],
        }
        expect(officialArrangementOf(viaMarked)).toEqual(['C1', 'V1'])
        expect(officialArrangementOf({ ...SONG, defaultArrangement: [], arrangements: [] })).toBeUndefined()
    })
})
