/**
 * State brain of the /session page. There is no local-vs-live branching any
 * more (DEC-35): ONE session object holds current song/part/key/playlist,
 * and Go Live merely swaps its transport. Everything here writes to the
 * session; display preferences stay per-device.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useSongs, useSong } from '@/hooks/useSongs'
import { useOnline } from '@/hooks/useOnline'
import { useLocalLibraryView, useRecordRecent } from '@/hooks/useLocalLibrary'
import { useWorshipSession } from '@/hooks/useWorshipSession'
import { usePlaylist } from '@/hooks/usePlaylists'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useSavedSession } from '@/hooks/useSavedSessions'
import { effectiveKeyOf, songChangeKey } from '@laude/session'
import type { EmbeddedSong, SessionPlaylistItem } from '@laude/session'
import type { KeyPolicy } from '@laude/song-model'
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

export function useSessionSongState(
    playlistId: string | undefined,
    savedSessionId?: string,
    seedSongId?: string,
) {
    // Search — offline (WP-157), the local library (downloads + recents +
    // guest-authored) replaces the remote catalogue.
    const online = useOnline()
    const [searchQuery, setSearchQuery] = useState('')
    const { data: searchResults } = useSongs({ search: searchQuery || undefined }, { enabled: online })
    const { data: allSongsData } = useSongs({}, { enabled: online })
    const { data: localView } = useLocalLibraryView()
    const recordRecent = useRecordRecent()
    const { data: initialPlaylist } = usePlaylist(playlistId || '')
    const { data: savedSession } = useSavedSession(savedSessionId || '')

    // Recently played persists per device (Flow 1) — never session state.
    const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>(() => {
        try {
            const stored = localStorage.getItem('laudasist.recentlyPlayed')
            const parsed: unknown = stored === null ? [] : JSON.parse(stored)
            return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
        } catch {
            return []
        }
    })
    useEffect(() => {
        localStorage.setItem('laudasist.recentlyPlayed', JSON.stringify(recentlyPlayed))
    }, [recentlyPlayed])
    const [playlistLoaded, setPlaylistLoaded] = useState(false)

    // ONE session object — local transport until Go Live swaps it.
    const live = useWorshipSession()
    const { session, state } = live

    // === DERIVED STATE (always from the session, solo or live) ===
    const currentSongId = state?.current.song_id ?? null
    // 'instrumental' (DEC-62) renders as no highlighted part on the owner surface.
    const rawPartIndex = state?.current.section_index ?? 0
    const currentPartIndex = typeof rawPartIndex === 'number' ? rawPartIndex : -1
    // THE sounding key (WP-144): read through the shared reader, never a
    // local derivation — every surface computes it identically.
    const displayKey = asKey(state ? effectiveKeyOf(state) : null)
    const keyPolicy = state?.key_policy ?? 'adopt'
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

    // Open a PERSISTED session (DEC-96): its by-value items become the
    // session's working playlist — a copy, same clone-in rule as playlists.
    useEffect(() => {
        if (savedSession && !playlistLoaded) {
            session.setPlaylist(
                savedSession.items.map((item) => ({
                    id: item.id,
                    songId: item.songId,
                    ...(item.key !== undefined ? { key: item.key } : {}),
                    ...(item.arrangement !== undefined ? { arrangement: item.arrangement } : {}),
                    ...(item.song !== undefined ? { song: item.song } : {}),
                })),
            )
            setPlaylistLoaded(true)
        }
    }, [savedSession, playlistLoaded, session])

    // Quick session from one library song (WP-146): seed it as the only
    // playlist entry and make it current — same by-value add rule as any
    // other add; authed fetch first, community fallback for guests.
    const [songSeeded, setSongSeeded] = useState(false)
    const { loading: authLoading } = useAuth()
    useEffect(() => {
        // Wait for Firebase to restore the sign-in — an early authed fetch
        // 401s and would mis-route a signed-in user to the public fallback.
        if (!seedSongId || songSeeded || authLoading) return
        let cancelled = false
        const seed = (song: Song) => {
            if (cancelled) return
            const item = {
                id: `seed-${song.id}`,
                songId: song.id,
                key: song.defaultKey,
                song: embed(song),
            }
            session.send({
                sessionPlaylist: [item],
                current: { song_id: song.id, section_index: 0, effective_key: song.defaultKey },
                currentSong: item.song,
            })
            setSongSeeded(true)
        }
        api.get<Song>(`/api/songs/${seedSongId}`)
            .then(seed)
            .catch(() =>
                api.get<Song>(`/api/community/songs/${seedSongId}`, { skipAuth: true })
                    .then(seed)
                    .catch((err: unknown) => console.warn('song seed failed', err)),
            )
        return () => {
            cancelled = true
        }
    }, [seedSongId, songSeeded, session, authLoading])

    // === UPDATE HELPERS (single write path, any transport) ===
    const setCurrentSongId = useCallback(
        (songId: string | null, entryKey?: string) => {
            // Presenters/viewers render the by-value currentSong — resolve the
            // embed from the playlist item or the loaded library (the relay
            // never resolves by-ref ids itself).
            const playlistItem = songId !== null
                ? sessionPlaylist.find((i) => i.songId === songId)
                : undefined
            const fromLibrary = songId !== null
                ? allSongsData?.data?.find((s) => s.id === songId)
                : undefined
            const embedded = playlistItem?.song ?? (fromLibrary ? embed(fromLibrary) : null)
            if (songId === null) {
                session.send({ current: { song_id: null, section_index: 0 }, currentSong: null })
                return
            }
            // Song-change key (WP-144/145): computed HERE, once, and
            // broadcast — never derived again on any client.
            const incoming = entryKey ?? playlistItem?.key ?? embedded?.defaultKey ?? 'C'
            const effective = songChangeKey(
                state?.key_policy ?? 'adopt',
                state ? effectiveKeyOf(state) : null,
                incoming,
            )
            session.send({
                current: { song_id: songId, section_index: 0, effective_key: effective },
                currentSong: embedded,
            })
        },
        [session, sessionPlaylist, allSongsData, state],
    )

    const setCurrentPartIndex = useCallback(
        (partIndex: number) => {
            session.setCurrent({ section_index: partIndex })
        },
        [session],
    )

    const setDisplayKey = useCallback(
        (key: Key) => {
            session.setCurrent({ effective_key: key })
        },
        [session],
    )

    const setKeyPolicy = useCallback(
        (policy: KeyPolicy) => {
            session.send({ key_policy: policy })
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
            const effective = songChangeKey(
                state?.key_policy ?? 'adopt',
                state ? effectiveKeyOf(state) : null,
                song.defaultKey,
            )
            session.send({
                current: { song_id: song.id, section_index: 0, effective_key: effective },
                currentSong: embed(song),
            })
            setSearchQuery('')
            setRecentlyPlayed((prev) => [song.id, ...prev.filter((id) => id !== song.id)].slice(0, 20))
            // Recents content cache (WP-158): a song played in a session is
            // one the user will want offline next time.
            recordRecent(song)
        },
        [session, sessionPlaylist, state, setSessionPlaylist, recordRecent],
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

    // Offline: search/browse over the local library instead.
    const localSongs = useMemo(() => {
        if (online) return null
        const songs = localView?.songs ?? []
        if (!searchQuery) return songs
        const q = searchQuery.toLowerCase()
        return songs.filter(
            (s) => s.title.toLowerCase().includes(q) || (s.author ?? '').toLowerCase().includes(q),
        )
    }, [online, localView, searchQuery])

    const displaySongs = localSongs ?? (searchQuery ? searchResults?.data : orderedSongs)

    // === DJ CAPABILITY MANIFEST (Flow 5) ===
    // Library songs the DJ can back with audio get a song-level marker; the
    // DJ's LOCAL-ONLY songs surface as DJ-sourced results the leader can
    // request (transmitted by-value, ephemeral).
    const djManifest = useMemo(() => state?.dj_manifest ?? [], [state])
    const djAudioSongIds = useMemo(
        () => new Set(djManifest.flatMap((e) => (e.song_id === null ? [] : [e.song_id]))),
        [djManifest],
    )
    const djLocalSongs = useMemo(() => {
        const localOnly = djManifest.filter((e) => e.song_id === null)
        if (!searchQuery) return localOnly
        const q = searchQuery.toLowerCase()
        return localOnly.filter((e) => e.title.toLowerCase().includes(q))
    }, [djManifest, searchQuery])

    const requestDjSong = useCallback(
        (localSongId: string) => {
            session.requestDjSong(localSongId)
            setSearchQuery('')
        },
        [session],
    )

    return {
        djAudioSongIds,
        djLocalSongs,
        requestDjSong,
        live,
        searchQuery,
        setSearchQuery,
        displaySongs,
        currentSong,
        currentSongId,
        currentPartIndex,
        displayKey,
        sessionPlaylist,
        keyPolicy,
        setKeyPolicy,
        setCurrentSongId,
        setCurrentPartIndex,
        setDisplayKey,
        setSessionPlaylist,
        pickSong,
        embed,
        savedSessionName: savedSession?.name,
    }
}
