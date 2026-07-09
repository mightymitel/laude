/**
 * State brain of the /session page: local practice state vs live session
 * state (via useLiveSession), unified update helpers that route to whichever
 * is active, song search/ordering, and the pick-song flow (with the by-value
 * temporary-playlist behaviour when live).
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSongs, useSong } from '@/hooks/useSongs'
import { useLiveSession } from '@/hooks/useLiveSession'
import { usePlaylist } from '@/hooks/usePlaylists'
import type { EmbeddedSong, SessionPlaylistItem } from '@laude/session'
import type { Key, Song } from '@laudasist/shared'
import { asKey } from '@/lib/keys'

function embed(song: Song): EmbeddedSong {
    return {
        id: song.id,
        title: song.title,
        author: song.author,
        originalKey: song.originalKey,
        parts: song.parts,
    }
}

export function useSessionSongState(playlistId: string | undefined) {
    // Search
    const [searchQuery, setSearchQuery] = useState('')
    const { data: searchResults } = useSongs({ search: searchQuery || undefined })
    const { data: allSongsData } = useSongs({})
    const { data: initialPlaylist } = usePlaylist(playlistId || '')

    // Local state for NON-LIVE practice mode only
    const [localSongId, setLocalSongId] = useState<string | null>(null)
    const [localPartIndex, setLocalPartIndex] = useState(0)
    const [localDisplayKey, setLocalDisplayKey] = useState<Key>('C')
    const [localPlaylist, setLocalPlaylist] = useState<SessionPlaylistItem[]>([])
    const [playlistLoaded, setPlaylistLoaded] = useState(false)
    const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>([])
    const [useOriginalKey, setUseOriginalKey] = useState(true)

    // Auto-load playlist from URL param
    useEffect(() => {
        if (initialPlaylist && !playlistLoaded) {
            const items = initialPlaylist.items.map((item) => ({
                id: `${Date.now()}-${item.songId}`,
                songId: item.songId,
                key: item.key,
                arrangement: item.arrangement,
            }))
            setLocalPlaylist(items)
            setPlaylistLoaded(true)
        }
    }, [initialPlaylist, playlistLoaded])

    // Live broadcasting over @laude/session (the relay owns state)
    const live = useLiveSession()
    const { isLive, session, updateSession, setPartIndex, setPlaylist } = live

    // === DERIVED STATE: session state when live, local state otherwise ===
    const currentSongId = isLive && session ? session.current.song_id : localSongId
    const currentPartIndex = isLive && session ? session.current.section_index : localPartIndex
    const displayKey = isLive && session ? asKey(session.current.key) : localDisplayKey
    const sessionPlaylist = isLive && session ? session.sessionPlaylist : localPlaylist

    const { data: currentSong } = useSong(currentSongId || '')

    // === UNIFIED STATE UPDATE HELPERS (local vs live routing) ===
    const setCurrentSongId = useCallback(
        (songId: string | null) => {
            if (isLive) updateSession({ current: { song_id: songId, section_index: 0 } })
            else setLocalSongId(songId)
        },
        [isLive, updateSession],
    )

    const setCurrentPartIndex = useCallback(
        (partIndex: number) => {
            if (isLive) setPartIndex(partIndex)
            else setLocalPartIndex(partIndex)
        },
        [isLive, setPartIndex],
    )

    const setDisplayKey = useCallback(
        (key: Key) => {
            if (isLive) updateSession({ current: { key } })
            else setLocalDisplayKey(key)
        },
        [isLive, updateSession],
    )

    const setSessionPlaylist = useCallback(
        (updater: SessionPlaylistItem[] | ((prev: SessionPlaylistItem[]) => SessionPlaylistItem[])) => {
            if (isLive) {
                const next = typeof updater === 'function' ? updater(sessionPlaylist) : updater
                setPlaylist(next)
            } else {
                setLocalPlaylist(updater)
            }
        },
        [isLive, sessionPlaylist, setPlaylist],
    )

    // Push the local playlist to the relay when going live
    useEffect(() => {
        if (isLive && localPlaylist.length > 0) {
            setPlaylist(localPlaylist)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLive])

    const pickSong = useCallback(
        (song: Song) => {
            if (isLive) {
                // Not in the playlist yet → add as a temporary (by-value) item
                if (!sessionPlaylist.some((item) => item.songId === song.id)) {
                    setSessionPlaylist((prev) => [
                        ...prev,
                        {
                            id: `temp-${Date.now()}-${song.id}`,
                            songId: song.id,
                            key: song.originalKey,
                            song: embed(song),
                            temporary: true,
                        },
                    ])
                }
                updateSession({
                    current: {
                        song_id: song.id,
                        section_index: 0,
                        ...(useOriginalKey ? { key: song.originalKey } : {}),
                    },
                    currentSong: embed(song),
                })
            } else {
                setCurrentSongId(song.id)
                setCurrentPartIndex(0)
                if (useOriginalKey) setDisplayKey(song.originalKey)
            }
            setSearchQuery('')
            setRecentlyPlayed((prev) => [song.id, ...prev.filter((id) => id !== song.id)].slice(0, 20))
        },
        [isLive, sessionPlaylist, useOriginalKey, setSessionPlaylist, updateSession, setCurrentSongId, setCurrentPartIndex, setDisplayKey],
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
