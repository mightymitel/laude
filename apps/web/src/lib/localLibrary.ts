/**
 * Web wiring for the WP-109 local library (WP-157/158): one IndexedDB
 * instance, Song ↔ local-row conversion, and the download/recents
 * operations. The SW never caches song data — this store owns it.
 *
 * Downloads carry the FULL song document as `source_doc` (per Mitel: an
 * offline song must look exactly like the online one — every part type,
 * arrangements, tags; only performance/studio data stays out). The chordpro
 * container is still written alongside as the canonical WORK chart for
 * cross-app interop; rendering prefers the snapshot and falls back to the
 * container for rows that predate it (guest-authored / imported).
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
        // Dates become ISO strings; reviveSongSnapshot turns them back.
        source_doc: JSON.parse(JSON.stringify(song)) as unknown,
    }
}

// --- Snapshot revival: unknown → Song by honest narrowing (we wrote the
// snapshot from a typed Song, so failures mean corruption → fall back to
// the chordpro container rather than crash). ---

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null
}

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v : fallback
}

function reviveParts(v: unknown): SongPart[] | null {
    if (!Array.isArray(v)) return null
    const parts: SongPart[] = []
    for (const [i, p] of v.entries()) {
        if (!isRecord(p) || !Array.isArray(p.lines)) return null
        const type = str(p.type)
        parts.push({
            id: str(p.id, `local-${i}`),
            type: isPartType(type) ? type : 'verse',
            index: typeof p.index === 'number' ? p.index : 0,
            lines: p.lines.map((l): { text: string } => ({ text: isRecord(l) ? str(l.text) : '' })),
        })
    }
    return parts
}

function reviveArrangements(v: unknown): Song['arrangements'] {
    if (!Array.isArray(v)) return []
    return v.flatMap((a) =>
        isRecord(a)
            ? [
                  {
                      id: str(a.id),
                      name: str(a.name),
                      order: Array.isArray(a.order) ? a.order.filter((o): o is string => typeof o === 'string') : [],
                      isDefault: a.isDefault === true,
                  },
              ]
            : [],
    )
}

export function reviveSongSnapshot(v: unknown): Song | null {
    if (!isRecord(v)) return null
    const parts = reviveParts(v.parts)
    if (typeof v.id !== 'string' || typeof v.title !== 'string' || parts === null) return null
    return {
        id: v.id,
        title: v.title,
        ...(typeof v.author === 'string' ? { author: v.author } : {}),
        defaultKey: asKey(str(v.defaultKey)),
        defaultArrangement: Array.isArray(v.defaultArrangement)
            ? v.defaultArrangement.filter((o): o is string => typeof o === 'string')
            : [],
        arrangements: reviveArrangements(v.arrangements),
        parts,
        tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : [],
        libraryType:
            v.libraryType === 'official' || v.libraryType === 'community' || v.libraryType === 'church'
                ? v.libraryType
                : 'user',
        ownerId: str(v.ownerId),
        visibility: v.visibility === 'public' ? 'public' : 'private',
        ...(typeof v.translationOf === 'string' ? { translationOf: v.translationOf } : {}),
        ...(typeof v.clonedFrom === 'string' ? { clonedFrom: v.clonedFrom } : {}),
        ...(Array.isArray(v.relatedSongs)
            ? { relatedSongs: v.relatedSongs.filter((r): r is string => typeof r === 'string') }
            : {}),
        createdAt: new Date(str(v.createdAt) || 0),
        updatedAt: new Date(str(v.updatedAt) || 0),
        createdBy: str(v.createdBy),
    }
}

function isPartType(value: string): value is PartType {
    return ['verse', 'chorus', 'bridge', 'pre-chorus', 'outro', 'intro', 'tag'].includes(value)
}

/** A local row rendered through the app's Song-shaped surfaces. Downloads
 * revive their full-fidelity snapshot; container-only rows (guest-authored,
 * imported) reconstruct from the chordpro chart. */
export function localRowToSong(row: LocalLibrarySong): Song {
    const revived = reviveSongSnapshot(row.source_doc)
    if (revived !== null) return revived
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
