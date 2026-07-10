import { getFirestore } from '../config/firebase.js';

/**
 * Global song_lyrics collection (@laude/song-model SongLyrics): the chordpro
 * chart (degrees + head {key:}) with visibility DENORMALIZED from the song so
 * security rules stay statically queryable (DEC-32). Doc id convention:
 * `{songId}-{language}` (shared with the Studio bridge — WP-114).
 */
export const SONG_LYRICS_COLLECTION = 'song_lyrics';

export function getSongLyricsCollection() {
    return getFirestore().collection(SONG_LYRICS_COLLECTION);
}

export function songLyricsDocId(songId: string, language: string): string {
    return `${songId}-${language}`;
}
