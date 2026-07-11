/**
 * Download fidelity (per Mitel): a downloaded song must revive EXACTLY as it
 * came — every part type, arrangements, tags — via the source_doc snapshot.
 */
import { describe, expect, it } from 'vitest'
import type { Song } from '@laudasist/shared'
import { reviveSongSnapshot } from '@/lib/localLibrary'

const RICH_SONG: Song = {
    id: 'g-42',
    title: 'Fidelitate',
    author: 'Echipa Laude',
    defaultKey: 'Eb',
    defaultArrangement: ['I1', 'V1', 'PC1', 'C1', 'T1'],
    arrangements: [
        { id: 'arr-1', name: 'Official', order: ['I1', 'V1', 'PC1', 'C1'], isDefault: true },
        { id: 'arr-2', name: 'Short', order: ['V1', 'C1'], isDefault: false },
    ],
    parts: [
        { id: 'p1', type: 'intro', index: 1, lines: [{ text: '[1]...' }] },
        { id: 'p2', type: 'verse', index: 1, lines: [{ text: '[1]rând [4]unu' }] },
        { id: 'p3', type: 'pre-chorus', index: 1, lines: [{ text: '[2m]pre' }] },
        { id: 'p4', type: 'chorus', index: 1, lines: [{ text: '[5]refren' }] },
        { id: 'p5', type: 'tag', index: 1, lines: [{ text: '[6m]tag' }] },
    ],
    tags: ['inchinare', 'closer'],
    libraryType: 'official',
    ownerId: 'uid-owner',
    visibility: 'public',
    relatedSongs: ['g-43'],
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-10T10:00:00.000Z'),
    createdBy: 'uid-owner',
}

describe('reviveSongSnapshot', () => {
    it('revives the stored JSON snapshot with full fidelity', () => {
        // Exactly what songToLocalRow persists: the JSON image of the Song.
        const snapshot: unknown = JSON.parse(JSON.stringify(RICH_SONG))
        const revived = reviveSongSnapshot(snapshot)
        expect(revived).toEqual(RICH_SONG)
    })

    it('keeps exotic part types and arrangements intact', () => {
        const revived = reviveSongSnapshot(JSON.parse(JSON.stringify(RICH_SONG)))
        expect(revived?.parts.map((p) => p.type)).toEqual(['intro', 'verse', 'pre-chorus', 'chorus', 'tag'])
        expect(revived?.arrangements).toHaveLength(2)
        expect(revived?.defaultArrangement).toEqual(['I1', 'V1', 'PC1', 'C1', 'T1'])
        expect(revived?.libraryType).toBe('official')
        expect(revived?.visibility).toBe('public')
    })

    it('rejects corrupt snapshots so callers fall back to the chart container', () => {
        expect(reviveSongSnapshot(null)).toBeNull()
        expect(reviveSongSnapshot('junk')).toBeNull()
        expect(reviveSongSnapshot({ id: 'x' })).toBeNull()
        expect(reviveSongSnapshot({ id: 'x', title: 'y', parts: [{ nope: true }] })).toBeNull()
    })
})
