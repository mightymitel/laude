/**
 * Debounced as-you-type lyrics search against the server-side endpoint
 * (WP-105, DEC-69). The debounce lives HERE so no caller can accidentally
 * cause a per-keystroke round-trip storm; stale responses are dropped.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface LyricsSearchResult {
    song_id: string;
    title: string;
    author: string | null;
    language: string;
    libraryType: string;
    visibility: 'public' | 'private';
    score: number;
    snippet: string;
}

const DEBOUNCE_MS = 250;

export function useLyricsSearch(
    query: string,
    options: { language?: string; limit?: number } = {},
): { results: LyricsSearchResult[]; isSearching: boolean } {
    const [results, setResults] = useState<LyricsSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const seqRef = useRef(0);
    const { language, limit } = options;

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        const seq = ++seqRef.current;
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: trimmed });
            if (language) params.set('language', language);
            if (limit) params.set('limit', String(limit));
            api.get<{ results: LyricsSearchResult[] }>(`/api/search/lyrics?${params}`)
                .then((body) => {
                    if (seqRef.current !== seq) return; // a newer query is in flight
                    setResults(body.results);
                    setIsSearching(false);
                })
                .catch((err: unknown) => {
                    if (seqRef.current !== seq) return;
                    console.warn('lyrics search failed', err);
                    setResults([]);
                    setIsSearching(false);
                });
        }, DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query, language, limit]);

    return { results, isSearching };
}
