import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import type { Key, SongPart } from '@laudasist/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Embedded song data type
export interface EmbeddedSong {
    id: string;
    title: string;
    author?: string;
    originalKey: Key;
    parts: SongPart[];
}

// Playlist item type
export interface SessionPlaylistItem {
    id: string;
    songId: string;
    key?: Key;
    song?: EmbeddedSong;
    temporary?: boolean; // Auto-added when owner selects a song not in playlist
}

// Session state returned from API
export interface SessionState {
    id: string;
    accessCode: string;
    status: 'active' | 'ended';
    currentSongId: string | null;
    currentSong: EmbeddedSong | null;
    currentPartIndex: number;
    displayKey: Key;
    chordStyle?: string;
    sessionPlaylist: SessionPlaylistItem[];
}

// Update payload type
export interface SessionUpdate {
    currentSongId?: string | null;
    currentSong?: EmbeddedSong | null;
    currentPartIndex?: number;
    displayKey?: Key;
    sessionPlaylist?: SessionPlaylistItem[];
}

/**
 * Hook to manage session state with TanStack Query.
 * - Fetches session state from API
 * - Polls every 5 seconds as fallback
 * - Listens for socket events to trigger instant refetch
 * - Provides mutation for optimistic updates
 */
export function useSessionState(accessCode: string | null) {
    const queryClient = useQueryClient();
    const socketRef = useRef<Socket | null>(null);
    const [socketConnected, setSocketConnected] = useState(false);

    // Fetch session state from API
    const query = useQuery({
        queryKey: ['sessionState', accessCode],
        queryFn: async () => {
            const data = await api.get<SessionState>(`/api/sessions/join/${accessCode}`);
            return data;
        },
        enabled: !!accessCode,
        refetchInterval: 5000, // Polling fallback
        staleTime: 2000,
    });

    // Setup socket connection for instant sync
    useEffect(() => {
        if (!accessCode) return;

        const socket = io(API_URL);
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[Socket] Connected', socket.id);
            setSocketConnected(true);
            // Join session room
            console.log('[Socket] Joining room', accessCode);
            socket.emit('session:join', accessCode);
        });

        socket.on('disconnect', () => {
            console.log('[Socket] Disconnected');
            setSocketConnected(false);
        });

        socket.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err);
            setSocketConnected(false);
        });

        // When state changes, invalidate query to refetch
        const handleStateChanged = () => {
            console.log('[Socket] Received state:changed');
            queryClient.invalidateQueries({ queryKey: ['sessionState', accessCode] });
        };

        // Direct state sync (for fast part/key changes)
        const handleStateSync = (data: Partial<SessionState>) => {
            console.log('[Socket] Received state:sync', data);
            queryClient.setQueryData(['sessionState', accessCode], (prev: SessionState | undefined) =>
                prev ? { ...prev, ...data } : prev
            );
        };

        socket.on('state:changed', handleStateChanged);
        socket.on('state:sync', handleStateSync);
        socket.on('session:end', handleStateChanged);

        return () => {
            socket.emit('session:leave', accessCode);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [accessCode, queryClient]);

    // Mutation for updating session state (server emits socket event)
    const mutation = useMutation({
        mutationFn: async (updates: SessionUpdate) => {
            if (!accessCode) throw new Error('No access code');
            await api.put(`/api/sessions/update/${accessCode}`, updates);
        },
        // Optimistic update for instant UI feedback
        onMutate: async (updates) => {
            await queryClient.cancelQueries({ queryKey: ['sessionState', accessCode] });
            const previousData = queryClient.getQueryData<SessionState>(['sessionState', accessCode]);

            if (previousData) {
                queryClient.setQueryData(['sessionState', accessCode], {
                    ...previousData,
                    ...updates
                });
            }

            return { previousData };
        },
        onError: (_err, _updates, context) => {
            // Rollback on error
            if (context?.previousData) {
                queryClient.setQueryData(['sessionState', accessCode], context.previousData);
            }
        },
        onSettled: () => {
            // Refetch to ensure consistency (server also emits event)
            queryClient.invalidateQueries({ queryKey: ['sessionState', accessCode] });
        }
    });

    // Notify other clients to refetch
    const notifyStateChanged = useCallback(() => {
        if (!accessCode || !socketRef.current) return;
        socketRef.current.emit('state:changed', { accessCode });
    }, [accessCode]);

    // Fast part change via direct socket (with background persistence)
    const emitPartChange = useCallback((partIndex: number) => {
        if (!accessCode || !socketRef.current) return;
        socketRef.current.emit('part:change', { accessCode, partIndex });
        // Persist to Firestore in background (fire-and-forget)
        api.put(`/api/sessions/update/${accessCode}`, { currentPartIndex: partIndex }).catch(console.error);
    }, [accessCode]);

    return {
        data: query.data,
        isLoading: query.isLoading,
        error: query.error,
        updateSession: mutation.mutate,
        updateSessionAsync: mutation.mutateAsync,
        isUpdating: mutation.isPending,
        notifyStateChanged,
        emitPartChange,
        socketConnected,
    };
}
