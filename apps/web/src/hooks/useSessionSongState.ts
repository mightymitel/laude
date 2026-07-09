/**
 * State brain of the /session page. There is no local-vs-live branching any
 * more (DEC-35): ONE session object holds current song/part/key/playlist,
 * and Go Live merely swaps its transport. Everything here writes to the
 * session; display preferences stay per-device.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSongs, useSong } from '@/hooks/useSongs'
import { useWorshipSession } from '@/hooks/useWorshipSession'
import { usePlaylist } from '@/hooks/usePlaylists'
import type { EmbeddedSong, SessionPlaylistItem } from '@laude/session'
import type { Key, Song } from '@laudasist/shared'
import { asKey } from '@/lib/keys'

function embed(song: Song): EmbeddedSong {
    return {
        id: song.id,
        title: song.title,
        author: song.author,
        defaultKey: song.defaultKey,
        parts: song.parts,
    }
}

export function useSessionSongState(playlistId: string | undefined) {
    // Search
    const [searchQuery, setSearchQuery] = useState('')
    const { data: searchResults } = useSongs({ search: searchQuery || undefined })
    const { data: allSongsData } = useSongs({})
    const { data: initialPlaylist } = usePlaylist(playlistId || '')

    const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>([])
    const [useOriginalKey, setUseOriginalKey] = useState(true)
    const [playlistLoaded, setPlaylistLoaded] = useState(false)

    // ONE session object — local transport until Go Live swaps it.
    const live = useWorshipSession()
    const { session, state } = live

    // === DERIVED STATE (always from the session, solo or live) ===
    const currentSongId = state?.current.song_id ?? null
    // 'instrumental' (DEC-62) renders as no highlighted part on the owner surface.
    const rawPartIndex = state?.current.section_index ?? 0
    const currentPartIndex = typeof rawPartIndex === 'number' ? rawPartIndex : -1
    const displayKey = asKey(state?.current.key ?? null)
    const sessionPlaylist = useMemo(() => state?.sessionPlaylist ?? [], [state])

    const { data: currentSong } = useSong(currentSongId || '')

    // Auto-load a saved (by-ref) playlist from the URL param into the session.
    useEffect(() => {
        if (initialPlaylist && !playlistLoaded) {
            session.setPlaylist(
                initialPlaylist.items.map((item) => ({
                    id: `${Date.now()}-${item.songId}`,
                    songId: item.songId,
                    key: item.key,
                    arrangement: item.arrangement,
                    song: item.song,
                })),
            )
            setPlaylistLoaded(true)
        }
    }, [initialPlaylist, playlistLoaded, session])

    // === UPDATE HELPERS (single write path, any transport) ===
    const setCurrentSongId = useCallback(
        (songId: string | null) => {
            // Presenters/viewers render the by-value currentSong — resolve the
            // embed from the playlist item or the loaded library (the relay
            // never resolves by-ref ids itself).
            const fromPlaylist = songId !== null
                ? sessionPlaylist.find((i) => i.songId === songId)?.song
                : undefined
            const fromLibrary = songId !== null
                ? allSongsData?.data?.find((s) => s.id === songId)
                : undefined
            const embedded = fromPlaylist ?? (fromLibrary ? embed(fromLibrary) : null)
            session.send({
                current: { song_id: songId, section_index: 0 },
                currentSong: songId === null ? null : embedded,
            })
        },
        [session, sessionPlaylist, allSongsData],
    )

    const setCurrentPartIndex = useCallback(
        (partIndex: number) => {
            session.setCurrent({ section_index: partIndex })
        },
        [session],
    )

    const setDisplayKey = useCallback(
        (key: Key) => {
            session.setCurrent({ key })
        },
        [session],
    )

    const setSessionPlaylist = useCallback(
        (updater: SessionPlaylistItem[] | ((prev: SessionPlaylistItem[]) => SessionPlaylistItem[])) => {
            const prev = session.state?.sessionPlaylist ?? []
            const next = typeof updater === 'function' ? updater(prev) : updater
            session.setPlaylist(next)
        },
        [session],
    )

    const pickSong = useCallback(
        (song: Song) => {
            // Not in the playlist yet → add as a temporary (by-value) item
            if (!sessionPlaylist.some((item) => item.songId === song.id)) {
                setSessionPlaylist((prev) => [
                    ...prev,
                    {
                        id: `temp-${Date.now()}-${song.id}`,
                        songId: song.id,
                        key: song.defaultKey,
                        song: embed(song),
                        temporary: true,
                    },
                ])
            }
            session.send({
                current: {
                    song_id: song.id,
                    section_index: 0,
                    ...(useOriginalKey ? { key: song.defaultKey } : {}),
                },
                currentSong: embed(song),
            })
            setSearchQuery('')
            setRecentlyPlayed((prev) => [song.id, ...prev.filter((id) => id !== song.id)].slice(0, 20))
        },
        [session, sessionPlaylist, useOriginalKey, setSessionPlaylist],
    )

    // Smart ordering for library view when search is empty
    const orderedSongs = useMemo(() => {
        if (searchQuery || !allSongsData?.data) return null
        const songs = [...allSongsData.data]
        const relatedIds = new Set(currentSong?.relatedSongs || [])
        const recentSet = new Set(recentlyPlayed)
        return songs.sort((a, b) => {
            const aRelated = relatedIds.has(a.id) ? 1 : 0
            const bRelated = relatedIds.has(b.id) ? 1 : 0
            if (aRelated !== bRelated) return bRelated - aRelated
            const aRecent = recentSet.has(a.id) ? 1 : 0
            const bRecent = recentSet.has(b.id) ? 1 : 0
            if (aRecent !== bRecent) return bRecent - aRecent
            return a.title.localeCompare(b.title)
        })
    }, [searchQuery, allSongsData, currentSong, recentlyPlayed])

    const displaySongs = searchQuery ? searchResults?.data : orderedSongs

    return {
        live,
        searchQuery,
        setSearchQuery,
        displaySongs,
        currentSong,
        currentSongId,
        currentPartIndex,
        displayKey,
        sessionPlaylist,
        useOriginalKey,
        setUseOriginalKey,
        setCurrentSongId,
        setCurrentPartIndex,
        setDisplayKey,
        setSessionPlaylist,
        pickSong,
        embed,
    }
}
