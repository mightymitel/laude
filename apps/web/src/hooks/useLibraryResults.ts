/**
 * Library search + browse results (WP-169/170/172 · DEC-140/145/150/151).
 *
 * STAGES govern timing: stage 1 is an instant, local pass over the personal
 * working set (own songs from the cached owner query + the local library's
 * downloads/recents/authored — no network on keystroke); stage 2 is the
 * backend federated QUERY over community + official, APPENDED when it
 * returns. Lower stages only append — nothing reorders under the finger.
 *
 * TIERS govern ranking (tier order = result order, no cross-tier re-sort):
 *   1 own → 2 downloaded/pinned → 3 recents → 4 community → 5 official.
 * Dedup by EXACT song id — the first tier to surface an id keeps the slot.
 *
 * BROWSE (empty query): the personal working set ONLY, with NO backend
 * fetch beyond the owner-scoped own-songs query — community/official are
 * reachable by SEARCHING, never by scrolling. A ~5-entry RECENT section
 * (last OPENED, from the local library's retention timestamps) renders
 * above My Songs — a display knob independent of the offline cache size.
 *
 * LANGUAGE FILTER (DEC-151): a separate runtime filter from UI locale;
 * fails OPEN — songs without a language field always pass.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Song, PaginatedResponse } from '@laudasist/shared'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useOnline } from '@/hooks/useOnline'
import { useLocalLibraryView } from '@/hooks/useLocalLibrary'

export type ContentLanguage = 'all' | 'ro' | 'en'
export type LibraryTier = 'own' | 'downloaded' | 'recent' | 'community' | 'official'

export interface TieredSong {
    song: Song
    tier: LibraryTier
    /** True when a pinned/cached local copy exists (offline guarantee). */
    offline: boolean
}

function passesLanguage(song: Song, filter: ContentLanguage): boolean {
    if (filter === 'all') return true
    // Fail OPEN: unlabelled legacy songs always show (DEC-151).
    return song.language === undefined || song.language === filter
}

function matchesQuery(song: Song, q: string): boolean {
    if (q === '') return true
    const needle = q.toLowerCase()
    return (
        song.title.toLowerCase().includes(needle) ||
        (song.author ?? '').toLowerCase().includes(needle)
    )
}

export function useLibraryResults(query: string, language: ContentLanguage) {
    const online = useOnline()
    const { firebaseUser, loading: authLoading } = useAuth()
    const q = query.trim()

    // Own songs: owner-scoped single query (NOT the merged list-dump) —
    // cached by react-query, so browse costs no fetch per keystroke.
    const ownQuery = useQuery({
        queryKey: ['songs', 'own', firebaseUser?.uid],
        enabled: online && !authLoading && firebaseUser !== null,
        queryFn: () =>
            api.get<PaginatedResponse<Song>>(
                `/api/songs?ownerId=${encodeURIComponent(firebaseUser!.uid)}&limit=100`,
            ),
    })

    const { data: localView } = useLocalLibraryView()

    // Stage 2: the backend federated query — QUERY-DRIVEN, never on browse.
    const backendSearch = useQuery({
        queryKey: ['songs', 'search', q],
        enabled: online && q !== '' && !authLoading,
        queryFn: () =>
            api.get<PaginatedResponse<Song>>(`/api/songs?search=${encodeURIComponent(q)}&limit=50`),
    })

    return useMemo(() => {
        const seen = new Set<string>()
        const results: TieredSong[] = []
        const offlineIds = new Set(
            (localView?.songs ?? []).map((s) => s.id),
        )
        const push = (song: Song, tier: LibraryTier) => {
            if (seen.has(song.id)) return
            if (!passesLanguage(song, language)) return
            seen.add(song.id)
            results.push({ song, tier, offline: offlineIds.has(song.id) })
        }

        // Tier 1 — own (server-authored; falls back to nothing offline
        // unless also downloaded, which tier 2 then covers).
        for (const song of ownQuery.data?.data ?? []) {
            if (matchesQuery(song, q)) push(song, 'own')
        }

        // Tiers 2 + 3 — the local library, pinned before cached.
        const retention = localView?.retention
        const localSongs = localView?.songs ?? []
        for (const song of localSongs) {
            if (!matchesQuery(song, q)) continue
            const klass = retention?.get(song.id)?.klass
            if (klass === 'pinned') push(song, 'downloaded')
        }
        for (const song of localSongs) {
            if (!matchesQuery(song, q)) continue
            const klass = retention?.get(song.id)?.klass
            if (klass === 'cached') push(song, 'recent')
            else if (klass === undefined) push(song, 'recent') // guest-authored/imported
        }

        // Tiers 4 + 5 — backend stage, appended when it returns.
        if (q !== '') {
            for (const song of backendSearch.data?.data ?? []) {
                push(song, song.libraryType === 'official' ? 'official' : 'community')
            }
        }

        // The ~5 RECENT browse section: last-opened first (retention
        // timestamps) — independent of the LRU cache size (DEC-150).
        const recentSection: TieredSong[] =
            q === ''
                ? localSongs
                      .map((song) => ({ song, at: retention?.get(song.id)?.last_opened_at ?? '' }))
                      .filter((r) => r.at !== '' && passesLanguage(r.song, language))
                      .sort((a, b) => b.at.localeCompare(a.at))
                      .slice(0, 5)
                      .map((r) => ({
                          song: r.song,
                          tier: (retention?.get(r.song.id)?.klass === 'pinned'
                              ? 'downloaded'
                              : 'recent') satisfies LibraryTier,
                          offline: true,
                      }))
                : []

        return {
            results,
            recentSection,
            searching: q !== '',
            backendPending: q !== '' && online && backendSearch.isLoading,
            ownPending: online && ownQuery.isLoading,
            online,
        }
    }, [ownQuery.data, ownQuery.isLoading, backendSearch.data, backendSearch.isLoading, localView, q, language, online])
}
