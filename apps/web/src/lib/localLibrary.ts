/**
 * Web wiring for the WP-109 local library (WP-157/158): one IndexedDB
 * instance, Song ↔ local-row conversion, and the download/recents
 * operations. The SW never caches song data — this store owns it.
 *
 * ⚠️ Downloads persist lyrics + chords through the ONE chart container
 * (chordpro degrees). Arrangements/viewport prefs are not persisted:
 * no rendering surface consumes arrangements today and viewport prefs are
 * per-device localStorage (DEC-42). Part types beyond verse/chorus/bridge
 * normalize to verse in the container (existing WP-109 behavior).
 */
import {
    IndexedDbLocalLibrary,
    chordproToEmbedded,
    embeddedToChordpro,
    pinSong,
    removeDownload,
    retentionMap,
    touchRecent,
    type LocalLibrarySong,
    type RetentionRow,
} from '@laude/local-library'
import type { Song, SongPart, PartType } from '@laudasist/shared'
import { asKey } from '@/lib/keys'

export const localLibrary = new IndexedDbLocalLibrary()

/** Downloaded rows key on the global id — one local copy per global song. */
const localIdFor = (globalId: string) => `dl-${globalId}`

function songToLocalRow(song: Song): LocalLibrarySong {
    const now = new Date().toISOString()
    return {
        id: localIdFor(song.id),
        global_song_id: song.id,
        link_state: 'linked',
        title: song.title,
        author: song.author ?? null,
        language: 'ro',
        chordpro: embeddedToChordpro({
            id: song.id,
            title: song.title,
            ...(song.author !== undefined ? { author: song.author } : {}),
            defaultKey: song.defaultKey,
            parts: song.parts,
        }),
        analysis_key: song.defaultKey,
        verified: false,
        origin: 'downloaded',
        created_at: now,
        updated_at: now,
    }
}

function isPartType(value: string): value is PartType {
    return ['verse', 'chorus', 'bridge', 'pre-chorus', 'outro', 'intro', 'tag'].includes(value)
}

/** A local row rendered through the app's Song-shaped surfaces. */
export function localRowToSong(row: LocalLibrarySong): Song {
    const embedded = chordproToEmbedded(row)
    const counters = new Map<string, number>()
    const parts: SongPart[] = embedded.parts.map((p, i) => {
        const type: PartType = isPartType(p.type) ? p.type : 'verse'
        const n = (counters.get(type) ?? 0) + 1
        counters.set(type, n)
        return { id: `local-${i}`, type, index: n, lines: p.lines }
    })
    return {
        id: row.global_song_id ?? row.id,
        title: row.title,
        ...(row.author !== null ? { author: row.author } : {}),
        defaultKey: asKey(row.analysis_key),
        defaultArrangement: [],
        arrangements: [],
        parts,
        tags: [],
        libraryType: 'user',
        ownerId: '',
        visibility: 'private',
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        createdBy: '',
    }
}

/** Pin a song for offline (the Download action). Content refreshes on re-download. */
export async function downloadSongForOffline(song: Song): Promise<void> {
    const existing = await localLibrary.getSong(localIdFor(song.id))
    await localLibrary.saveSong({
        ...songToLocalRow(song),
        ...(existing !== null ? { created_at: existing.created_at } : {}),
    })
    await pinSong(localLibrary, localIdFor(song.id), new Date().toISOString())
}

export async function removeDownloadedSong(globalId: string): Promise<void> {
    await removeDownload(localLibrary, localIdFor(globalId))
}

/**
 * Recents (WP-158): every song OPENED while online lands in the store as a
 * cached copy (LRU past the cap) — so "songs I used recently" just work
 * offline. Pinned rows only refresh content + timestamp.
 */
export async function recordRecentSong(song: Song): Promise<void> {
    const id = localIdFor(song.id)
    const existing = await localLibrary.getSong(id)
    await localLibrary.saveSong({
        ...songToLocalRow(song),
        ...(existing !== null ? { created_at: existing.created_at } : {}),
    })
    await touchRecent(localLibrary, id, new Date().toISOString())
}

export interface LocalLibraryView {
    songs: Song[]
    /** Keyed by GLOBAL song id where linked, else local id. */
    retention: Map<string, RetentionRow>
}

/** Everything usable offline, as Song-shaped rows + retention classes. */
export async function loadLocalLibraryView(): Promise<LocalLibraryView> {
    const [rows, retention] = await Promise.all([
        localLibrary.listSongs(),
        retentionMap(localLibrary),
    ])
    const byGlobal = new Map<string, RetentionRow>()
    for (const row of rows) {
        const r = retention.get(row.id)
        if (r) byGlobal.set(row.global_song_id ?? row.id, r)
    }
    return { songs: rows.map(localRowToSong), retention: byGlobal }
}

export async function getLocalSongByGlobalId(globalId: string): Promise<Song | null> {
    const row =
        (await localLibrary.getSong(localIdFor(globalId))) ??
        (await localLibrary.getSong(globalId))
    return row === null ? null : localRowToSong(row)
}
