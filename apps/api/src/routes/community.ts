import { Router } from 'express';
import { getSongsCollection } from '../models/Song.js';

const router = Router();

/**
 * GET /api/community/songs
 * Public endpoint - returns community library songs (no auth required)
 */
router.get('/songs', async (req, res) => {
    try {
        const { search, limit = 50 } = req.query;

        let query = getSongsCollection()
            .where('isPublic', '==', true)
            .orderBy('title')
            .limit(Number(limit));

        const snapshot = await query.get();
        const songs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Client-side search filter if search param provided
        let filteredSongs = songs;
        if (search && typeof search === 'string') {
            const searchLower = search.toLowerCase();
            filteredSongs = songs.filter((song: any) =>
                song.title?.toLowerCase().includes(searchLower) ||
                song.author?.toLowerCase().includes(searchLower)
            );
        }

        return res.json({ data: filteredSongs, total: filteredSongs.length });
    } catch (error) {
        console.error('Error fetching community songs:', error);
        return res.status(500).json({ error: 'Failed to fetch community songs' });
    }
});

/**
 * GET /api/community/songs/:id
 * Get a single public song (no auth required)
 */
router.get('/songs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await getSongsCollection().doc(id).get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const song = doc.data();
        if (!song?.isPublic) {
            return res.status(403).json({ error: 'Song is not public' });
        }

        return res.json({ id: doc.id, ...song });
    } catch (error) {
        console.error('Error fetching community song:', error);
        return res.status(500).json({ error: 'Failed to fetch song' });
    }
});

export default router;
