import { getFirestore } from '../config/firebase.js';
import type { Song as SongType } from '../shared/index.js';

export interface SongDocument extends Omit<SongType, 'id'> {
    // Platform contract fields (@laude/song-model Song) — written alongside
    // the Laudasist shape so one doc serves both readers (same merged shape
    // the seeder writes).
    canonical_title: string;
    default_key: string;
    language: 'ro' | 'en';
    verified: boolean;
    created_at: string; // ISO
    // Backend-specific search fields
    _search_title?: string;
    _search_author?: string;
    _search_tags?: string[];
}

export const SONGS_COLLECTION = 'songs';

export function getSongsCollection() {
    return getFirestore().collection(SONGS_COLLECTION);
}