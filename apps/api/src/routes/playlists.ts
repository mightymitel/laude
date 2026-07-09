import { Router, type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
    createPlaylist,
    getPlaylistsByOwner,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist,
    generatePlaylistItemId,
    type PlaylistItem,
} from '../models/Playlist.js';

const router = Router();

// Get all playlists for current user
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Identity comes from the auth middleware (verified ID token) —
        // NEVER from a client-supplied header (WP-122).
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const playlists = await getPlaylistsByOwner(userId);
        return res.json(playlists);
    } catch (error) {
        console.error('Error fetching playlists:', error);
        return res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

// Create a new playlist
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Identity comes from the auth middleware (verified ID token) —
        // NEVER from a client-supplied header (WP-122).
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Playlist name required' });
        }

        const playlist = await createPlaylist(userId, name, description);
        return res.status(201).json(playlist);
    } catch (error) {
        console.error('Error creating playlist:', error);
        return res.status(500).json({ error: 'Failed to create playlist' });
    }
});

// Get a specific playlist
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Playlist ID required' });
        }
        const playlist = await getPlaylistById(id);

        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        return res.json(playlist);
    } catch (error) {
        console.error('Error fetching playlist:', error);
        return res.status(500).json({ error: 'Failed to fetch playlist' });
    }
});

// Update a playlist
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Playlist ID required' });
        }
        const { name, description, items } = req.body;

        // Verify ownership
        const existing = await getPlaylistById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        if (existing.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized to update this playlist' });
        }

        const updated = await updatePlaylist(id, { name, description, items });
        return res.json(updated);
    } catch (error) {
        console.error('Error updating playlist:', error);
        return res.status(500).json({ error: 'Failed to update playlist' });
    }
});

// Delete a playlist
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Playlist ID required' });
        }

        // Verify ownership
        const existing = await getPlaylistById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        if (existing.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized to delete this playlist' });
        }

        await deletePlaylist(id);
        return res.status(204).send();
    } catch (error) {
        console.error('Error deleting playlist:', error);
        return res.status(500).json({ error: 'Failed to delete playlist' });
    }
});

// Add a song to a playlist
router.post('/:id/items', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Playlist ID required' });
        }
        const { songId, key, arrangement } = req.body;

        if (!songId) {
            return res.status(400).json({ error: 'Song ID required' });
        }

        const playlist = await getPlaylistById(id);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        if (playlist.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const newItem: PlaylistItem = {
            id: generatePlaylistItemId(),
            songId,
            key,
            arrangement,
            order: playlist.items.length,
        };

        const updatedItems = [...playlist.items, newItem];
        const updated = await updatePlaylist(id, { items: updatedItems });

        return res.status(201).json(updated);
    } catch (error) {
        console.error('Error adding item to playlist:', error);
        return res.status(500).json({ error: 'Failed to add item' });
    }
});

// Remove a song from a playlist
router.delete('/:id/items/:itemId', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const { id, itemId } = req.params;
        if (!id || !itemId) {
            return res.status(400).json({ error: 'Playlist ID and Item ID required' });
        }

        const playlist = await getPlaylistById(id);
        if (!playlist) {
            return res.status(404).json({ error: 'Playlist not found' });
        }
        if (playlist.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updatedItems = playlist.items
            .filter((item) => item.id !== itemId)
            .map((item, index) => ({ ...item, order: index }));

        const updated = await updatePlaylist(id, { items: updatedItems });

        return res.json(updated);
    } catch (error) {
        console.error('Error removing item from playlist:', error);
        return res.status(500).json({ error: 'Failed to remove item' });
    }
});

export default router;
