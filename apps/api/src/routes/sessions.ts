import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    createLiveSession,
    getLiveSessionByCode,
    getLiveSessionById,
    endLiveSession,
    updateLiveSession,
    getActiveSessionByOwner
} from '../models/LiveSession.js';

const router = Router();

/**
 * POST /api/sessions/live
 * Start a new live session (requires auth)
 */
router.post('/live', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId!;

        // Check if user already has an active session
        const existing = await getActiveSessionByOwner(userId);
        if (existing) {
            return res.json(existing); // Return existing session
        }

        const session = await createLiveSession(userId);
        return res.status(201).json(session);
    } catch (error) {
        console.error('Error creating live session:', error);
        return res.status(500).json({ error: 'Failed to create session' });
    }
});

/**
 * DELETE /api/sessions/live/:id
 * End a live session (requires auth)
 */
router.delete('/live/:id', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId!;
        const id = req.params.id!;

        const session = await getLiveSessionById(id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await endLiveSession(id);
        return res.json({ success: true });
    } catch (error) {
        console.error('Error ending live session:', error);
        return res.status(500).json({ error: 'Failed to end session' });
    }
});

/**
 * PUT /api/sessions/live/:id
 * Update session state (requires auth)
 */
router.put('/live/:id', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId!;
        const id = req.params.id!;
        const { currentSongId, currentPartIndex, displayKey, chordStyle } = req.body;

        const session = await getLiveSessionById(id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updates: Record<string, unknown> = {};
        if (currentSongId !== undefined) updates.currentSongId = currentSongId;
        if (currentPartIndex !== undefined) updates.currentPartIndex = currentPartIndex;
        if (displayKey !== undefined) updates.displayKey = displayKey;
        if (chordStyle !== undefined) updates.chordStyle = chordStyle;

        await updateLiveSession(id, updates);
        return res.json({ success: true });
    } catch (error) {
        console.error('Error updating live session:', error);
        return res.status(500).json({ error: 'Failed to update session' });
    }
});

/**
 * GET /api/sessions/join/:accessCode
 * Join a session by access code (PUBLIC - no auth required)
 */
router.get('/join/:accessCode', async (req, res) => {
    try {
        const { accessCode } = req.params;

        const session = await getLiveSessionByCode(accessCode.toUpperCase());
        if (!session) {
            return res.status(404).json({ error: 'Session not found or ended' });
        }

        // Return session info (without ownerId for privacy)
        return res.json({
            id: session.id,
            accessCode: session.accessCode,
            status: session.status,
            currentSongId: session.currentSongId,
            currentPartIndex: session.currentPartIndex,
            displayKey: session.displayKey,
            chordStyle: session.chordStyle,
        });
    } catch (error) {
        console.error('Error joining session:', error);
        return res.status(500).json({ error: 'Failed to join session' });
    }
});

export default router;
