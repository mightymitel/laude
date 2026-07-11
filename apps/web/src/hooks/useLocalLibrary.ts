/** React-query surface of the WP-109 local library (WP-157/158). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Song } from '@laudasist/shared'
import {
    downloadSongForOffline,
    loadLocalLibraryView,
    recordRecentSong,
    removeDownloadedSong,
} from '@/lib/localLibrary'

export const localLibraryKey = ['local-library'] as const

export function useLocalLibraryView() {
    return useQuery({
        queryKey: localLibraryKey,
        queryFn: loadLocalLibraryView,
        // IndexedDB is local — no network retry semantics wanted.
        retry: false,
        networkMode: 'always',
    })
}

export function useDownloadSong() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (song: Song) => downloadSongForOffline(song),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: localLibraryKey }),
    })
}

export function useRemoveDownload() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (globalId: string) => removeDownloadedSong(globalId),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: localLibraryKey }),
    })
}

/** Fire-and-forget recents write for a song the user just opened. */
export function useRecordRecent() {
    const queryClient = useQueryClient()
    return (song: Song) => {
        recordRecentSong(song)
            .then(() => queryClient.invalidateQueries({ queryKey: localLibraryKey }))
            .catch((err: unknown) => console.warn('recents write failed', err))
    }
}
