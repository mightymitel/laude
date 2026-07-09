/**
 * In-memory lyrics search index (WP-105, DEC-69). Lyrics are the reliable
 * signal for worship songs — titles are filed under first lines, chorus
 * hooks, or translated names, and extracted titles come from OCR'd slides.
 *
 * One mechanism, two callers: Laudasist's presenter search (as-you-type) and
 * the mint-or-link bridge's candidate matcher.
 *
 * Deliberately small: linear scan over a normalized in-memory corpus,
 * rebuilt when stale (TTL) or explicitly invalidated by library writes.
 * Scaling past ~100 songs (real index / embeddings) is DEFERRED — do not
 * grow this file into one.
 */
import { getFirestore } from '../config/firebase.js';

export interface LyricsSearchResult {
    song_id: string;
    title: string;
    author: string | null;
    language: string;
    libraryType: string;
    visibility: 'public' | 'private';
    score: number;
    /** The best-matching lyric line, chords stripped. */
    snippet: string;
}

interface IndexedSong {
    song_id: string;
    title: string;
    author: string | null;
    language: string;
    libraryType: string;
    visibility: 'public' | 'private';
    ownerId: string | null;
    normTitle: string;
    /** Normalized lyric text, one entry per line (for snippets). */
    lines: string[];
    /** Original (chord-stripped) lines, index-aligned with `lines`. */
    displayLines: string[];
}

const TTL_MS = 15_000;
let corpus: IndexedSong[] = [];
let builtAt = 0;
let building: Promise<void> | null = null;

/** Strip chordpro syntax down to singable text. */
export function lyricText(chordproOrLine: string): string {
    return chordproOrLine
        .replace(/\{[^}]*\}/g, '') // directives
        .replace(/\[[^\]]*\]/g, '') // chord brackets
        .trim();
}

/** Lowercase, diacritics-free (ș→s, ă→a …), collapsed whitespace. */
export function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Force a rebuild on the next query — call after any library write. */
export function invalidateLyricsIndex(): void {
    builtAt = 0;
}

async function rebuild(): Promise<void> {
    const db = getFirestore();
    const [songsSnap, lyricsSnap] = await Promise.all([
        db.collection('songs').get(),
        db.collection('song_lyrics').get(),
    ]);
    const chordproBySong = new Map<string, string>();
    for (const doc of lyricsSnap.docs) {
        const songId = doc.get('song_id');
        const chordpro = doc.get('chordpro');
        if (typeof songId === 'string' && typeof chordpro === 'string') {
            chordproBySong.set(songId, chordpro);
        }
    }

    corpus = songsSnap.docs.map((doc) => {
        const title = typeof doc.get('title') === 'string' ? String(doc.get('title')) : String(doc.get('canonical_title') ?? '');
        const author = typeof doc.get('author') === 'string' ? String(doc.get('author')) : null;
        const chordpro = chordproBySong.get(doc.id);
        let displayLines: string[];
        if (chordpro !== undefined) {
            displayLines = chordpro.split('\n').map(lyricText).filter(Boolean);
        } else {
            // Fallback: the laudasist song shape embeds parts[].lines[].text.
            const parts: unknown = doc.get('parts');
            displayLines = Array.isArray(parts)
                ? parts.flatMap((p: { lines?: { text?: string }[] }) =>
                      (p.lines ?? []).map((l) => lyricText(l.text ?? '')).filter(Boolean),
                  )
                : [];
        }
        return {
            song_id: doc.id,
            title,
            author,
            language: String(doc.get('language') ?? 'ro'),
            libraryType: String(doc.get('libraryType') ?? 'community'),
            visibility: doc.get('visibility') === 'private' ? 'private' as const : 'public' as const,
            ownerId: typeof doc.get('ownerId') === 'string' ? String(doc.get('ownerId')) : null,
            normTitle: normalize(title),
            lines: displayLines.map(normalize),
            displayLines,
        };
    });
    builtAt = Date.now();
}

async function ensureFresh(): Promise<void> {
    if (Date.now() - builtAt < TTL_MS) return;
    // Coalesce concurrent rebuilds (as-you-type fires bursts).
    building ??= rebuild().finally(() => {
        building = null;
    });
    await building;
}

export interface LyricsSearchOptions {
    language?: string;
    /** Identities the caller may own private songs under (uid + user doc id). */
    viewerIds?: string[];
    limit?: number;
}

export async function searchLyrics(
    query: string,
    options: LyricsSearchOptions = {},
): Promise<LyricsSearchResult[]> {
    await ensureFresh();
    const tokens = normalize(query).split(' ').filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];
    const phrase = tokens.join(' ');
    const viewerIds = new Set(options.viewerIds ?? []);
    const limit = options.limit ?? 10;

    const results: LyricsSearchResult[] = [];
    for (const song of corpus) {
        if (song.visibility === 'private' && (song.ownerId === null || !viewerIds.has(song.ownerId))) {
            continue;
        }
        if (options.language !== undefined && song.language !== options.language) continue;

        let score = 0;
        let bestLine = -1;
        for (const token of tokens) {
            if (song.normTitle.includes(token)) score += 3;
            const lineIdx = song.lines.findIndex((l) => l.includes(token));
            if (lineIdx !== -1) {
                score += 1;
                if (bestLine === -1) bestLine = lineIdx;
            }
        }
        // Phrase bonus: consecutive words matter more than a bag of tokens.
        if (tokens.length > 1) {
            const phraseLine = song.lines.findIndex((l) => l.includes(phrase));
            if (phraseLine !== -1) {
                score += 4;
                bestLine = phraseLine;
            } else if (song.normTitle.includes(phrase)) {
                score += 4;
            }
        }
        if (score === 0) continue;
        results.push({
            song_id: song.song_id,
            title: song.title,
            author: song.author,
            language: song.language,
            libraryType: song.libraryType,
            visibility: song.visibility,
            score,
            snippet: bestLine === -1 ? (song.displayLines[0] ?? '') : (song.displayLines[bestLine] ?? ''),
        });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
}
