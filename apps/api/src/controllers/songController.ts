import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getSongsCollection, SongDocument } from '../models/Song.js';
import type { LibraryType, Visibility } from '../shared/index.js';

// Helper to handle async errors would be nice, but standard try/catch for now

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

        // Base query
        let query = getSongsCollection().orderBy('createdAt', 'desc');

        if (libraryType && typeof libraryType === 'string') {
            query = query.where('libraryType', '==', libraryType);
        }

        if (ownerId && typeof ownerId === 'string') {
            query = query.where('ownerId', '==', ownerId);
        } else if (!libraryType) {
            // Default: show my songs
            query = query.where('ownerId', '==', req.userId!);
        }

        if (visibility && typeof visibility === 'string') {
            query = query.where('visibility', '==', visibility);
        }

        if (tags && typeof tags === 'string') {
            query = query.where('tags', 'array-contains-any', tags.split(','));
        }

        // Search Logic
        let allDocs;
        const isSearching = search && typeof search === 'string' && search.length > 0;

        if (isSearching) {
            allDocs = (await query.get()).docs;
        } else {
            const pageNum = parseInt(page as string, 10);
            const limitNum = Math.min(parseInt(limit as string, 10), 100);
            query = query.offset((pageNum - 1) * limitNum).limit(limitNum);
            allDocs = (await query.get()).docs;
        }

        let songs = allDocs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                title: data.title,
                author: data.author,
                originalKey: data.originalKey,
                tags: data.tags,
                libraryType: data.libraryType,
                visibility: data.visibility,
                parts: data.parts,
                createdAt: data.createdAt instanceof Date ? data.createdAt : (data.createdAt as any)?.toDate(),
            };
        });

        if (isSearching) {
            const searchLower = (search as string).toLowerCase();
            songs = songs.filter(s => {
                if (s.title?.toLowerCase().includes(searchLower)) return true;
                if (s.author?.toLowerCase().includes(searchLower)) return true;
                if (s.parts) {
                    return s.parts.some((p: any) =>
                        p.lines.some((l: any) =>
                            l.text.toLowerCase().includes(searchLower)
                        )
                    );
                }
                return false;
            });
        }

        const total = isSearching ? songs.length : 1000;
        const pageNum = parseInt(page as string, 10);
        const limitNum = Math.min(parseInt(limit as string, 10), 100);

        let paginatedSongs = songs;
        if (isSearching) {
            const start = (pageNum - 1) * limitNum;
            paginatedSongs = songs.slice(start, start + limitNum);
        }

        res.json({
            data: paginatedSongs,
            total: total,
            page: pageNum,
            limit: limitNum,
            hasMore: isSearching ? (pageNum * limitNum < total) : (allDocs.length === limitNum),
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
            createdAt: song.createdAt instanceof Date ? song.createdAt : (song.createdAt as any)?.toDate(),
            updatedAt: song.updatedAt instanceof Date ? song.updatedAt : (song.updatedAt as any)?.toDate(),
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
            originalKey,
            defaultArrangement,
            arrangements,
            parts,
            tags,
            visibility = 'private',
        } = req.body;

        if (!title || !originalKey || !parts || !Array.isArray(parts)) {
            res.status(400).json({ error: 'Missing required fields: title, originalKey, parts' });
            return;
        }

        const newSong: SongDocument = {
            title,
            author,
            originalKey,
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

        const docRef = await getSongsCollection().add(newSong);

        res.status(201).json({
            id: docRef.id,
            title: newSong.title,
            author: newSong.author,
            originalKey: newSong.originalKey,
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
            originalKey,
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

        if (title) updateData.title = title;
        if (author !== undefined) updateData.author = author;
        if (originalKey) updateData.originalKey = originalKey;
        if (defaultArrangement) updateData.defaultArrangement = defaultArrangement;
        if (arrangements) updateData.arrangements = arrangements;
        if (parts) updateData.parts = parts;
        if (tags) updateData.tags = tags;
        if (visibility) updateData.visibility = visibility;
        if (relatedSongs) updateData.relatedSongs = relatedSongs;

        await docRef.update(updateData);

        const updatedDoc = await docRef.get();
        const updatedSong = updatedDoc.data() as SongDocument;

        res.json({
            id: updatedDoc.id,
            title: updatedSong.title,
            updatedAt: updatedSong.updatedAt instanceof Date ? updatedSong.updatedAt : (updatedSong.updatedAt as any)?.toDate(),
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

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting song:', error);
        res.status(500).json({ error: 'Failed to delete song' });
    }
};
