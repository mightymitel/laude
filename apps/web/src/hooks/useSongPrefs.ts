/**
 * Per-song personal prefs (WP-162 / DEC-133): {favoriteKey, notes} per
 * user × song. One fetch loads the whole map (small collection); a
 * localStorage mirror keeps the overlay readable offline (write-through on
 * fetch and save). favoriteKey seeds the INITIAL display key on open /
 * solo-play only — a shared session's effective_key is never touched.
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useOnline } from '@/hooks/useOnline'

export interface SongPref {
    favoriteKey?: string
    notes?: string
}

export type SongPrefsMap = Record<string, SongPref>

const MIRROR_KEY = 'laudasist.songPrefs'

function readMirror(): SongPrefsMap {
    try {
        const raw = localStorage.getItem(MIRROR_KEY)
        const parsed: unknown = raw === null ? {} : JSON.parse(raw)
        return typeof parsed === 'object' && parsed !== null ? (parsed as SongPrefsMap) : {}
    } catch {
        return {}
    }
}

function writeMirror(prefs: SongPrefsMap): void {
    try {
        localStorage.setItem(MIRROR_KEY, JSON.stringify(prefs))
    } catch {
        // Quota failures must never break the app; the mirror is best-effort.
    }
}

export const songPrefsKey = ['song-prefs'] as const

export function useSongPrefs() {
    const { firebaseUser, loading } = useAuth()
    const online = useOnline()
    return useQuery({
        queryKey: songPrefsKey,
        enabled: !loading && firebaseUser !== null,
        networkMode: 'always',
        queryFn: async (): Promise<SongPrefsMap> => {
            if (!online) return readMirror()
            const res = await api.get<{ data: SongPrefsMap }>('/api/users/me/song-prefs')
            writeMirror(res.data)
            return res.data
        },
    })
}

export function useSaveSongPref() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({
            songId,
            ...patch
        }: {
            songId: string
            favoriteKey?: string | null
            notes?: string | null
        }) => api.put<{ songId: string } & SongPref>(`/api/users/me/song-prefs/${songId}`, patch),
        // Optimistic: a ★ toggle must light instantly, not after a round-trip.
        onMutate: async ({ songId, favoriteKey, notes }) => {
            await queryClient.cancelQueries({ queryKey: songPrefsKey })
            const previous = queryClient.getQueryData<SongPrefsMap>(songPrefsKey)
            queryClient.setQueryData<SongPrefsMap>(songPrefsKey, (old) => {
                const next = { ...(old ?? {}) }
                const pref: SongPref = { ...next[songId] }
                if (favoriteKey !== undefined) {
                    if (favoriteKey === null) delete pref.favoriteKey
                    else pref.favoriteKey = favoriteKey
                }
                if (notes !== undefined) {
                    if (notes === null || notes === '') delete pref.notes
                    else pref.notes = notes
                }
                if (Object.keys(pref).length === 0) delete next[songId]
                else next[songId] = pref
                return next
            })
            return { previous }
        },
        onError: (err, _vars, context) => {
            console.warn('song-pref save failed', err)
            if (context?.previous !== undefined) {
                queryClient.setQueryData(songPrefsKey, context.previous)
            }
        },
        onSuccess: (saved, { songId }) => {
            const mirror = readMirror()
            const { songId: _songId, ...pref } = saved
            if (Object.keys(pref).length === 0) delete mirror[songId]
            else mirror[songId] = pref
            writeMirror(mirror)
        },
        onSettled: () => void queryClient.invalidateQueries({ queryKey: songPrefsKey }),
    })
}

/** Synchronous favorite-key lookup for solo-play seeding paths. */
export function useFavoriteKeyOf(): (songId: string) => string | null {
    const { data } = useSongPrefs()
    return useCallback(
        (songId: string) => {
            const pref = data?.[songId] ?? readMirror()[songId]
            return pref?.favoriteKey ?? null
        },
        [data],
    )
}
