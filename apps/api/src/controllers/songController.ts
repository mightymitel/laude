import { Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { partsToChordPro, renderChordPro } from '@laude/chords';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getSongsCollection, SongDocument } from '../models/Song.js';
import { getSongLyricsCollection, songLyricsDocId } from '../models/SongLyrics.js';
import { invalidateLyricsIndex } from '../search/lyricsIndex.js';
import type { LibraryType, Visibility, SongPart, SongLine } from '../shared/index.js';

type Lang = 'ro' | 'en';

function asLang(value: unknown): Lang {
    return value === 'en' ? 'en' : 'ro';
}

/**
 * Build + parse-check the degree chart from the song's embedded parts, then
 * upsert the denormalized song_lyrics doc (DEC-32/46). Throws on a chart the
 * renderer can't parse back — an honest 400 beats storing junk.
 */
async function syncSongLyrics(
    songId: string,
    song: { title: string; defaultKey: string; language: Lang; parts: SongPart[]; visibility: Visibility; verified: boolean },
): Promise<void> {
    const chordpro = partsToChordPro(song.parts, song.defaultKey, song.title);
    renderChordPro(chordpro, { notation: 'nashville' }); // round-trip check (DEC-46)
    await getSongLyricsCollection().doc(songLyricsDocId(songId, song.language)).set({
        song_id: songId,
        lang: song.language,
        chordpro,
        visibility: song.visibility,
        verified: song.verified,
    });
}

export const listSongs = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const {
            search,
            libraryType,
            ownerId,
            visibility,
            tags,
            page = '1',
            limit = '20',
        } = req.query;

        const isSearching = search && typeof search === 'string' && search.length > 0;
        const hasExplicitFilter =
            (ownerId && typeof ownerId === 'string') ||
            (libraryType && typeof libraryType === 'string') ||
            (visibility && typeof visibility === 'string') ||
            (tags && typeof tags === 'string');

        let allDocs;
        if (!hasExplicitFilter) {
            // Default scope: everything this user may sing from — their own
            // songs, community (public) songs and the official library.
            // Firestore has no OR across fields, so three indexed queries
            // merged in memory (each composite with createdAt exists).
            const base = () => getSongsCollection().orderBy('createdAt', 'desc').limit(500);
            const [mine, community, official] = await Promise.all([
                base().where('ownerId', '==', req.userId!).get(),
                base().where('visibility', '==', 'public').get(),
                base().where('libraryType', '==', 'official').get(),
            ]);
            const byId = new Map(
                [...mine.docs, ...community.docs, ...official.docs].map(doc => [doc.id, doc]),
            );
            const millis = (v: unknown): number => {
                if (v instanceof Date) return v.getTime();
                if (v instanceof Timestamp) return v.toMillis();
                return 0;
            };
            allDocs = [...byId.values()].sort(
                (a, b) => millis(b.data().createdAt) - millis(a.data().createdAt),
            );
        } else {
            // Explicit filters keep the single-query behavior.
            let query = getSongsCollection().orderBy('createdAt', 'desc');

            if (libraryType && typeof libraryType === 'string') {
                query = query.where('libraryType', '==', libraryType);
            }

            if (ownerId && typeof ownerId === 'string') {
                query = query.where('ownerId', '==', ownerId);
            } else if (!libraryType) {
                query = query.where('ownerId', '==', req.userId!);
            }

            if (visibility && typeof visibility === 'string') {
                query = query.where('visibility', '==', visibility);
            }

            if (tags && typeof tags === 'string') {
                query = query.where('tags', 'array-contains-any', tags.split(','));
            }

            allDocs = (await query.get()).docs;
        }

        let songs = allDocs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title,
                author: data.author,
                defaultKey: data.defaultKey,
                tags: data.tags,
                libraryType: data.libraryType,
                ownerId: data.ownerId,
                visibility: data.visibility,
                parts: data.parts,
                createdAt: data.createdAt instanceof Date ? data.createdAt : (data.createdAt as Timestamp)?.toDate(),
            };
        });

        if (isSearching) {
            const searchLower = (search as string).toLowerCase();
            songs = songs.filter(s => {
                if (s.title?.toLowerCase().includes(searchLower)) return true;
                if (s.author?.toLowerCase().includes(searchLower)) return true;
                if (s.parts) {
                    return s.parts.some((p: SongPart) =>
                        p.lines.some((l: SongLine) =>
                            l.text.toLowerCase().includes(searchLower)
                        )
                    );
                }
                return false;
            });
        }

        // Both branches now fetch the full scope, so paginate in memory.
        const total = songs.length;
        const pageNum = parseInt(page as string, 10);
        const limitNum = Math.min(parseInt(limit as string, 10), 100);
        const start = (pageNum - 1) * limitNum;
        const paginatedSongs = songs.slice(start, start + limitNum);

        res.json({
            data: paginatedSongs,
            total: total,
            page: pageNum,
            limit: limitNum,
            hasMore: pageNum * limitNum < total,
        });
    } catch (error) {
        console.error('Error listing songs:', error);
        res.status(500).json({ error: 'Failed to list songs' });
    }
};

export const getSong = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const doc = await getSongsCollection().doc(req.params.id!).get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Song not found' });
            return;
        }

        const song = doc.data() as SongDocument;

        if (
            song.visibility === 'private' &&
            song.ownerId !== req.userId &&
            song.libraryType !== 'official'
        ) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        res.json({
            id: doc.id,
            ...song,
            createdAt: song.createdAt instanceof Date ? song.createdAt : (song.createdAt as Timestamp)?.toDate(),
            updatedAt: song.updatedAt instanceof Date ? song.updatedAt : (song.updatedAt as Timestamp)?.toDate(),
        });
    } catch (error) {
        console.error('Error fetching song:', error);
        res.status(500).json({ error: 'Failed to fetch song' });
    }
};

export const createSong = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const {
            title,
            author,
            defaultKey,
            defaultArrangement,
            arrangements,
            parts,
            tags,
            language,
            // Imports and new songs land PRIVATE (DEC-108); publishing to
            // community is a separate, owner-only visibility flip.
            visibility = 'private',
        } = req.body;

        if (!title || !defaultKey || !parts || !Array.isArray(parts)) {
            res.status(400).json({ error: 'Missing required fields: title, defaultKey, parts' });
            return;
        }

        const lang = asLang(language);
        const newSong: SongDocument = {
            // Platform contract (@laude/song-model Song)
            canonical_title: title,
            default_key: defaultKey,
            language: lang,
            verified: false, // imported/typed content is unverified until curation
            created_at: new Date().toISOString(),
            // Laudasist fields (the shape the current UI reads)
            title,
            // Firestore rejects literal undefined values — omit absent author.
            ...(author !== undefined ? { author } : {}),
            defaultKey,
            defaultArrangement: defaultArrangement || [],
            arrangements: arrangements || [],
            parts,
            tags: tags || [],
            libraryType: 'user' as LibraryType,
            ownerId: req.userId!,
            visibility: visibility as Visibility,
            createdBy: req.userId!,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        try {
            // Chart first: if the parts don't survive the degree round-trip
            // (DEC-46) nothing is written at all.
            const probe = partsToChordPro(parts, defaultKey, title);
            renderChordPro(probe, { notation: 'nashville' });
        } catch (err) {
            res.status(400).json({
                error: 'Chart does not parse as a degree chordpro',
                message: err instanceof Error ? err.message : String(err),
            });
            return;
        }

        const docRef = await getSongsCollection().add(newSong);
        await syncSongLyrics(docRef.id, {
            title,
            defaultKey,
            language: lang,
            parts,
            visibility: newSong.visibility,
            verified: newSong.verified,
        });
        invalidateLyricsIndex();

        res.status(201).json({
            id: docRef.id,
            title: newSong.title,
            author: newSong.author,
            defaultKey: newSong.defaultKey,
            libraryType: newSong.libraryType,
            createdAt: newSong.createdAt,
        });
    } catch (error) {
        console.error('Error creating song:', error);
        res.status(500).json({ error: 'Failed to create song' });
    }
};

export const updateSong = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const docRef = getSongsCollection().doc(req.params.id!);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Song not found' });
            return;
        }

        const song = doc.data() as SongDocument;

        if (song.ownerId !== req.userId) {
            res.status(403).json({ error: 'Not authorized to edit this song' });
            return;
        }

        const {
            title,
            author,
            defaultKey,
            defaultArrangement,
            arrangements,
            parts,
            tags,
            visibility,
            relatedSongs,
        } = req.body;

        const updateData: Partial<SongDocument> = {
            updatedAt: new Date(),
        };

        // Platform mirrors ride along with the Laudasist fields (one doc,
        // two readers — the merged shape the seeder writes).
        if (title) {
            updateData.title = title;
            updateData.canonical_title = title;
        }
        if (author !== undefined) updateData.author = author;
        if (defaultKey) {
            updateData.defaultKey = defaultKey;
            updateData.default_key = defaultKey;
        }
        if (defaultArrangement) updateData.defaultArrangement = defaultArrangement;
        if (arrangements) updateData.arrangements = arrangements;
        if (parts) updateData.parts = parts;
        if (tags) updateData.tags = tags;
        if (visibility) updateData.visibility = visibility;
        if (relatedSongs) updateData.relatedSongs = relatedSongs;

        const chartChanged = Boolean(title || defaultKey || parts || visibility);
        if (chartChanged) {
            try {
                const probe = partsToChordPro(
                    parts ?? song.parts,
                    defaultKey ?? song.defaultKey,
                    title ?? song.title,
                );
                renderChordPro(probe, { notation: 'nashville' });
            } catch (err) {
                res.status(400).json({
                    error: 'Chart does not parse as a degree chordpro',
                    message: err instanceof Error ? err.message : String(err),
                });
                return;
            }
        }

        await docRef.update(updateData);

        const updatedDoc = await docRef.get();
        const updatedSong = updatedDoc.data() as SongDocument;

        // Keep the denormalized song_lyrics copy in step — chart content AND
        // visibility (DEC-32: rules query the copy, so a publish flip must
        // reach it atomically-enough for the demo scale).
        if (chartChanged) {
            await syncSongLyrics(updatedDoc.id, {
                title: updatedSong.title,
                defaultKey: updatedSong.defaultKey,
                language: asLang(updatedSong.language),
                parts: updatedSong.parts,
                visibility: updatedSong.visibility,
                verified: updatedSong.verified ?? false,
            });
            invalidateLyricsIndex();
        }

        res.json({
            id: updatedDoc.id,
            title: updatedSong.title,
            updatedAt: updatedSong.updatedAt instanceof Date ? updatedSong.updatedAt : (updatedSong.updatedAt as Timestamp)?.toDate(),
        });
    } catch (error) {
        console.error('Error updating song:', error);
        res.status(500).json({ error: 'Failed to update song' });
    }
};

export const deleteSong = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const docRef = getSongsCollection().doc(req.params.id!);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Song not found' });
            return;
        }

        const song = doc.data() as SongDocument;

        if (song.ownerId !== req.userId) {
            res.status(403).json({ error: 'Not authorized to delete this song' });
            return;
        }

        await docRef.delete();
        // The denormalized chart goes with the song (id convention + a
        // song_id query for safety — legacy docs may predate the convention).
        const lyricsRef = getSongLyricsCollection();
        await lyricsRef.doc(songLyricsDocId(doc.id, asLang(song.language))).delete();
        const strays = await lyricsRef.where('song_id', '==', doc.id).get();
        await Promise.all(strays.docs.map((d) => d.ref.delete()));
        invalidateLyricsIndex();

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting song:', error);
        res.status(500).json({ error: 'Failed to delete song' });
    }
};
