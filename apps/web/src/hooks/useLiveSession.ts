import { useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useSessionState, type SessionState, type SessionPlaylistItem, type EmbeddedSong } from './useSessionState';
import type { Key, ChordStyle } from '@laudasist/shared';

// Full session context including secret presenter code
interface LiveSessionContext {
    id: string;
    accessCode: string;
    presenterCode: string;
}

// Extended session type combining context + state
export interface LiveSession extends Omit<SessionState, 'id' | 'accessCode'> {
    id: string;
    accessCode: string;
    presenterCode: string;
}

export function useLiveSession() {
    // Static auth info (presenterCode is secret)
    const [sessionContext, setSessionContext] = useState<LiveSessionContext | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // TanStack Query sync - handles socket + polling
    const { data: sessionState, updateSession, isUpdating, socketConnected } = useSessionState(sessionContext?.accessCode || null);

    // Start a live session
    const startLive = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const newSession = await api.post<LiveSessionContext>('/api/sessions/live', {});
            setSessionContext({
                id: newSession.id,
                accessCode: newSession.accessCode,
                presenterCode: newSession.presenterCode
            });
            setIsLive(true);
            return newSession;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start session');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // End the session
    const endLive = useCallback(async () => {
        if (!sessionContext) return;
        try {
            await api.delete(`/api/sessions/live/${sessionContext.id}`);
            setSessionContext(null);
            setIsLive(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to end session');
        }
    }, [sessionContext]);

    // Merged session object for consumers
    const session = useMemo((): LiveSession | null => {
        if (!sessionContext) return null;

        // Default state while loading
        const defaults = {
            status: 'active' as const,
            currentSongId: null,
            currentSong: null,
            currentPartIndex: 0,
            displayKey: 'C' as Key,
            chordStyle: 'letters' as ChordStyle,
            sessionPlaylist: [] as SessionPlaylistItem[]
        };

        return {
            ...sessionContext,
            ...(sessionState || defaults)
        };
    }, [sessionContext, sessionState]);

    // Simple update methods that call the mutation
    const selectSong = useCallback((songId: string | null, song: EmbeddedSong | null, key?: Key) => {
        updateSession({
            currentSongId: songId,
            currentSong: song,
            currentPartIndex: 0,
            ...(key && { displayKey: key })
        });
    }, [updateSession]);

    const setPartIndex = useCallback((partIndex: number) => {
        updateSession({ currentPartIndex: partIndex });
    }, [updateSession]);

    const setDisplayKey = useCallback((key: Key) => {
        updateSession({ displayKey: key });
    }, [updateSession]);

    const setPlaylist = useCallback((playlist: SessionPlaylistItem[]) => {
        updateSession({ sessionPlaylist: playlist });
    }, [updateSession]);

    // Legacy API for backward compatibility
    const broadcastUpdate = useCallback((update: { songId: string | null; partIndex: number; key: Key }) => {
        updateSession({
            currentSongId: update.songId,
            currentPartIndex: update.partIndex,
            displayKey: update.key
        });
    }, [updateSession]);

    const syncPlaylist = useCallback((playlist: SessionPlaylistItem[]) => {
        updateSession({ sessionPlaylist: playlist });
    }, [updateSession]);

    // URLs
    const getShareUrl = useCallback(() => {
        if (!sessionContext) return '';
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        return `${baseUrl}/view/${sessionContext.accessCode}`;
    }, [sessionContext]);

    const getPresenterUrl = useCallback(() => {
        if (!sessionContext) return '';
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        return `${baseUrl}/present/${sessionContext.presenterCode}`;
    }, [sessionContext]);

    // No-ops for legacy compatibility
    const setOnRemoteUpdate = useCallback(() => { }, []);
    const broadcastSongChange = useCallback(() => { }, []);
    const broadcastPartChange = useCallback(() => { }, []);
    const broadcastKeyChange = useCallback(() => { }, []);

    return {
        session,
        isLive,
        isLoading,
        isUpdating,
        error,
        socketConnected,
        startLive,
        endLive,
        // New API
        selectSong,
        setPartIndex,
        setDisplayKey,
        setPlaylist,
        updateSession,
        // Legacy API
        broadcastUpdate,
        syncPlaylist,
        getShareUrl,
        getPresenterUrl,
        setOnRemoteUpdate,
        broadcastSongChange,
        broadcastPartChange,
        broadcastKeyChange,
    };
}
