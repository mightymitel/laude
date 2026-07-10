/**
 * The persisted session, narrow (DEC-96/99): named, owner-scoped, holds a
 * playlist BY-VALUE, opens back into /session and can go live repeatedly.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EmbeddedSong } from '@laude/session';

export interface SavedSessionItem {
    id: string;
    songId: string;
    key?: string;
    arrangement?: string;
    song?: EmbeddedSong;
}

export interface SavedSession {
    id: string;
    ownerId: string;
    name: string;
    items: SavedSessionItem[];
    createdAt: string | Date;
    updatedAt: string | Date;
}

export const savedSessionKeys = {
    all: ['saved-sessions'] as const,
    detail: (id: string) => ['saved-sessions', id] as const,
};

export function useSavedSessions() {
    return useQuery({
        queryKey: savedSessionKeys.all,
        queryFn: () => api.get<SavedSession[]>('/api/saved-sessions'),
    });
}

export function useSavedSession(id: string) {
    return useQuery({
        queryKey: savedSessionKeys.detail(id),
        queryFn: () => api.get<SavedSession>(`/api/saved-sessions/${id}`),
        enabled: !!id,
    });
}

export function useCreateSavedSession() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: { name: string; items: SavedSessionItem[] }) =>
            api.post<SavedSession>('/api/saved-sessions', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: savedSessionKeys.all });
        },
    });
}

export function useUpdateSavedSession() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...data }: { id: string; name?: string; items?: SavedSessionItem[] }) =>
            api.put<SavedSession>(`/api/saved-sessions/${id}`, data),
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: savedSessionKeys.all });
            queryClient.invalidateQueries({ queryKey: savedSessionKeys.detail(vars.id) });
        },
    });
}

export function useDeleteSavedSession() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete<void>(`/api/saved-sessions/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: savedSessionKeys.all });
        },
    });
}
