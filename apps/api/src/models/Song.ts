import { getFirestore } from '../config/firebase.js';
import type { Song as SongType } from '@laudasist/shared';

export interface SongDocument extends Omit<SongType, 'id'> {
    // Add any backend-specific fields here if needed
    // e.g. searchable text fields
    _search_title?: string;
    _search_author?: string;
    _search_tags?: string[];
}

export const SONGS_COLLECTION = 'songs';

export function getSongsCollection() {
    return getFirestore().collection(SONGS_COLLECTION);
}