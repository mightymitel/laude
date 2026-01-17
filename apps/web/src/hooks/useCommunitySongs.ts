import { useState, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Song } from '@laudasist/shared';

interface UseCommunitySongsOptions {
    search?: string;
}

interface CommunitySongsResult {
    data: Song[] | undefined;
    isLoading: boolean;
    error: Error | undefined;
}

/**
 * Hook to fetch songs from the community library (public, no auth)
 */
export function useCommunitySongs(options: UseCommunitySongsOptions = {}): CommunitySongsResult {
    const [data, setData] = useState<Song[] | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | undefined>(undefined);

    const fetchSongs = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (options.search) params.set('search', options.search);

            const response = await api.get<{ data: Song[] }>(`/api/community/songs?${params}`);
            setData(response.data);
            setError(undefined);
        } catch (err) {
            setError(err as Error);
        } finally {
            setIsLoading(false);
        }
    }, [options.search]);

    useEffect(() => {
        fetchSongs();
    }, [fetchSongs]);

    return { data, isLoading, error };
}

/**
 * Hook to fetch a single song from community library
 */
export function useCommunitySong(id: string): { data: Song | undefined; isLoading: boolean } {
    const [data, setData] = useState<Song | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!id) {
            setIsLoading(false);
            return;
        }

        const fetchSong = async () => {
            try {
                const song = await api.get<Song>(`/api/community/songs/${id}`);
                setData(song);
            } catch (err) {
                console.error('Failed to fetch community song:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSong();
    }, [id]);

    return { data, isLoading };
}

// Favorites management using localStorage
const FAVORITES_KEY = 'laudasist_favorites';

export function useFavorites() {
    const [favorites, setFavorites] = useState<string[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem(FAVORITES_KEY);
        if (stored) {
            try {
                setFavorites(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse favorites:', e);
            }
        }
    }, []);

    const addFavorite = useCallback((songId: string) => {
        setFavorites(prev => {
            const updated = [...new Set([...prev, songId])];
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const removeFavorite = useCallback((songId: string) => {
        setFavorites(prev => {
            const updated = prev.filter(id => id !== songId);
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const isFavorite = useCallback((songId: string) => {
        return favorites.includes(songId);
    }, [favorites]);

    return { favorites, addFavorite, removeFavorite, isFavorite };
}
