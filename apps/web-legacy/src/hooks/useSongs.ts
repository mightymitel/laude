'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Song, PaginatedResponse } from '@laudasist/shared';

interface SongListParams {
    search?: string;
    libraryType?: string;
    tags?: string;
    page?: number;
    limit?: number;
}

interface CreateSongData {
    title: string;
    author?: string;
    originalKey: string;
    parts: Song['parts'];
    defaultArrangement?: string[];
    arrangements?: Song['arrangements'];
    tags?: string[];
    visibility?: 'public' | 'private';
}

interface UpdateSongData extends Partial<CreateSongData> {
    relatedSongs?: string[];
}

// Query keys
export const songKeys = {
    all: ['songs'] as const,
    lists: () => [...songKeys.all, 'list'] as const,
    list: (params: SongListParams) => [...songKeys.lists(), params] as const,
    details: () => [...songKeys.all, 'detail'] as const,
    detail: (id: string) => [...songKeys.details(), id] as const,
    versions: (id: string) => [...songKeys.detail(id), 'versions'] as const,
};

/**
 * Hook to fetch paginated song list
 */
export function useSongs(params: SongListParams = {}) {
    return useQuery({
        queryKey: songKeys.list(params),
        queryFn: () => {
            const searchParams = new URLSearchParams();
            if (params.search) searchParams.set('search', params.search);
            if (params.libraryType) searchParams.set('libraryType', params.libraryType);
            if (params.tags) searchParams.set('tags', params.tags);
            if (params.page) searchParams.set('page', String(params.page));
            if (params.limit) searchParams.set('limit', String(params.limit));

            const query = searchParams.toString();
            return api.get<PaginatedResponse<Song>>(`/api/songs${query ? `?${query}` : ''}`);
        },
    });
}

/**
 * Hook to fetch a single song
 */
export function useSong(id: string) {
    return useQuery({
        queryKey: songKeys.detail(id),
        queryFn: () => api.get<Song>(`/api/songs/${id}`),
        enabled: !!id,
    });
}

/**
 * Hook to fetch song versions (translations, clones)
 */
export function useSongVersions(id: string) {
    return useQuery({
        queryKey: songKeys.versions(id),
        queryFn: () => api.get<{ original: string | null; versions: Song[] }>(`/api/songs/${id}/versions`),
        enabled: !!id,
    });
}

/**
 * Hook to create a new song
 */
export function useCreateSong() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateSongData) => api.post<Song>('/api/songs', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: songKeys.lists() });
        },
    });
}

/**
 * Hook to update a song
 */
export function useUpdateSong(id: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: UpdateSongData) => api.put<Song>(`/api/songs/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: songKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: songKeys.lists() });
        },
    });
}

/**
 * Hook to delete a song
 */
export function useDeleteSong() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.delete<{ success: boolean }>(`/api/songs/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: songKeys.lists() });
        },
    });
}

/**
 * Hook to clone a song
 */
export function useCloneSong() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.post<Song>(`/api/songs/${id}/clone`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: songKeys.lists() });
        },
    });
}
