
import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import type { Key, ChordStyle } from '@laudasist/shared';

interface LiveSession {
    id: string;
    accessCode: string;
    status: 'active' | 'ended';
    currentSongId: string | null;
    currentPartIndex: number;
    displayKey: Key;
    chordStyle: ChordStyle;
}

interface SessionUpdate {
    songId: string | null;
    partIndex: number;
    key: Key;
    // Include full song data for guest viewers (no auth needed)
    song?: {
        id: string;
        title: string;
        author?: string;
        originalKey: Key;
        parts: unknown[];
    } | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useLiveSession() {
    const [session, setSession] = useState<LiveSession | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // Start a live session
    const startLive = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const newSession = await api.post<LiveSession>('/api/sessions/live', {});
            setSession(newSession);
            setIsLive(true);

            // Connect to socket and join room as presenter
            const socket = io(API_URL);
            socketRef.current = socket;
            socket.emit('session:join', newSession.accessCode);

            return newSession;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start session');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // End the live session
    const endLive = useCallback(async () => {
        if (!session) return;

        try {
            await api.delete(`/api/sessions/live/${session.id}`);

            // Notify all viewers
            if (socketRef.current) {
                socketRef.current.emit('session:end', session.accessCode);
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            setSession(null);
            setIsLive(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to end session');
        }
    }, [session]);

    // Broadcast update to viewers
    const broadcastUpdate = useCallback((update: SessionUpdate) => {
        if (!session || !socketRef.current) return;

        socketRef.current.emit('session:update', {
            accessCode: session.accessCode,
            ...update,
        });

        // Also update via API for persistence
        api.put(`/api/sessions/live/${session.id}`, {
            currentSongId: update.songId,
            currentPartIndex: update.partIndex,
            displayKey: update.key,
        }).catch(console.error);
    }, [session]);

    // Get share URL
    const getShareUrl = useCallback(() => {
        if (!session) return '';
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        return `${baseUrl}/view/${session.accessCode}`;
    }, [session]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    return {
        session,
        isLive,
        isLoading,
        error,
        startLive,
        endLive,
        broadcastUpdate,
        getShareUrl,
    };
}
