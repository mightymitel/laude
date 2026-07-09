import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Key } from '@laudasist/shared';
import type { EmbeddedSong } from '@laude/session';

export interface PlaylistItem {
    id: string;
    songId: string;
    key?: Key;
    arrangement?: string;
    order: number;
    /** By-value payload (portable-playlist envelope, DEC-38); legacy saved
     * playlists are by-ref and hydrate from the library on load. */
    song?: EmbeddedSong;
}

export interface Playlist {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
    items: PlaylistItem[];
    createdAt: Date;
    updatedAt: Date;
}

// Fetch all playlists for current user
export function usePlaylists() {
    return useQuery({
        queryKey: ['playlists'],
        queryFn: () => api.get<Playlist[]>('/api/playlists'),
    });
}

// Fetch a single playlist
export function usePlaylist(id: string) {
    return useQuery({
        queryKey: ['playlists', id],
        queryFn: () => api.get<Playlist>(`/api/playlists/${id}`),
        enabled: !!id,
    });
}

// Create a new playlist
export function useCreatePlaylist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: { name: string; description?: string }) =>
            api.post<Playlist>('/api/playlists', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
        },
    });
}

// Update a playlist
export function useUpdatePlaylist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            ...data
        }: { id: string; name?: string; description?: string; items?: (Omit<PlaylistItem, 'key'> & { key?: string })[] }) =>
            api.put<Playlist>(`/api/playlists/${id}`, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            queryClient.invalidateQueries({ queryKey: ['playlists', variables.id] });
        },
    });
}

// Delete a playlist
export function useDeletePlaylist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.delete<void>(`/api/playlists/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
        },
    });
}

// Add song to playlist
export function useAddSongToPlaylist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            playlistId,
            songId,
            key,
            arrangement,
        }: {
            playlistId: string;
            songId: string;
            key?: Key;
            arrangement?: string;
        }) => api.post<Playlist>(`/api/playlists/${playlistId}/items`, { songId, key, arrangement }),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            queryClient.invalidateQueries({ queryKey: ['playlists', variables.playlistId] });
        },
    });
}

// Remove song from playlist
export function useRemoveSongFromPlaylist() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            playlistId,
            itemId,
        }: {
            playlistId: string;
            itemId: string;
        }) => api.delete<Playlist>(`/api/playlists/${playlistId}/items/${itemId}`),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            queryClient.invalidateQueries({ queryKey: ['playlists', variables.playlistId] });
        },
    });
}
