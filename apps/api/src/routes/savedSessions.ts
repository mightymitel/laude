/**
 * /api/saved-sessions — the narrow persisted session (DEC-96/99): CRUD on
 * {name, items-by-value}, strictly owner-scoped. Reads are owner-only too:
 * a saved session may embed PRIVATE songs by-value, so it is not a sharing
 * channel — the live session (go-live links) is.
 */
import { Router, type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import {
    createSavedSession,
    deleteSavedSession,
    getSavedSessionById,
    getSavedSessionsByOwner,
    updateSavedSession,
    type SavedSessionItem,
} from '../models/SavedSession.js';

const router = Router();

function requireUser(req: AuthenticatedRequest, res: Response): string | null {
    if (!req.userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return null;
    }
    return req.userId;
}

function asItems(value: unknown): SavedSessionItem[] | null {
    if (!Array.isArray(value)) return null;
    const items: SavedSessionItem[] = [];
    for (const raw of value) {
        if (typeof raw !== 'object' || raw === null) return null;
        const item = raw as Record<string, unknown>;
        if (typeof item.songId !== 'string') return null;
        items.push({
            id: typeof item.id === 'string' ? item.id : `${items.length}-${item.songId}`,
            songId: item.songId,
            ...(typeof item.key === 'string' ? { key: item.key } : {}),
            ...(typeof item.arrangement === 'string' ? { arrangement: item.arrangement } : {}),
            ...(item.song !== undefined ? { song: item.song } : {}),
        });
    }
    return items;
}

// My sessions
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        res.json(await getSavedSessionsByOwner(userId));
    } catch (error) {
        console.error('Error listing saved sessions:', error);
        res.status(500).json({ error: 'Failed to list saved sessions' });
    }
});

// Save a session
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const { name, items } = req.body;
        if (typeof name !== 'string' || name.trim() === '') {
            res.status(400).json({ error: 'Session name required' });
            return;
        }
        const parsedItems = asItems(items ?? []);
        if (parsedItems === null) {
            res.status(400).json({ error: 'items must be a list of playlist items (songId required)' });
            return;
        }
        res.status(201).json(await createSavedSession(userId, name.trim(), parsedItems));
    } catch (error) {
        console.error('Error creating saved session:', error);
        res.status(500).json({ error: 'Failed to save session' });
    }
});

// Open one (owner-only: it can embed private songs by-value)
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const saved = await getSavedSessionById(req.params.id!);
        if (!saved) {
            res.status(404).json({ error: 'Saved session not found' });
            return;
        }
        if (saved.ownerId !== userId) {
            res.status(403).json({ error: 'Not your session' });
            return;
        }
        res.json(saved);
    } catch (error) {
        console.error('Error fetching saved session:', error);
        res.status(500).json({ error: 'Failed to fetch saved session' });
    }
});

// Rename / replace items
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const saved = await getSavedSessionById(req.params.id!);
        if (!saved) {
            res.status(404).json({ error: 'Saved session not found' });
            return;
        }
        if (saved.ownerId !== userId) {
            res.status(403).json({ error: 'Not your session' });
            return;
        }
        const { name, items } = req.body;
        const updates: { name?: string; items?: SavedSessionItem[] } = {};
        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim() === '') {
                res.status(400).json({ error: 'Session name cannot be empty' });
                return;
            }
            updates.name = name.trim();
        }
        if (items !== undefined) {
            const parsedItems = asItems(items);
            if (parsedItems === null) {
                res.status(400).json({ error: 'items must be a list of playlist items (songId required)' });
                return;
            }
            updates.items = parsedItems;
        }
        res.json(await updateSavedSession(saved.id, updates));
    } catch (error) {
        console.error('Error updating saved session:', error);
        res.status(500).json({ error: 'Failed to update saved session' });
    }
});

// Delete
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
        const saved = await getSavedSessionById(req.params.id!);
        if (!saved) {
            res.status(404).json({ error: 'Saved session not found' });
            return;
        }
        if (saved.ownerId !== userId) {
            res.status(403).json({ error: 'Not your session' });
            return;
        }
        await deleteSavedSession(saved.id);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting saved session:', error);
        res.status(500).json({ error: 'Failed to delete saved session' });
    }
});

export default router;
