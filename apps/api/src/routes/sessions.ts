import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    createLiveSession,
    getLiveSessionByCode,
    getLiveSessionByPresenterCode,
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
        const { currentSongId, currentSong, currentPartIndex, displayKey, chordStyle, sessionPlaylist } = req.body;

        const session = await getLiveSessionById(id);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.ownerId !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const updates: Record<string, unknown> = {};
        if (currentSongId !== undefined) updates.currentSongId = currentSongId;
        if (currentSong !== undefined) updates.currentSong = currentSong;
        if (currentPartIndex !== undefined) updates.currentPartIndex = currentPartIndex;
        if (displayKey !== undefined) updates.displayKey = displayKey;
        if (chordStyle !== undefined) updates.chordStyle = chordStyle;
        if (sessionPlaylist !== undefined) updates.sessionPlaylist = sessionPlaylist;

        await updateLiveSession(id, updates);

        // Emit state change to all clients in the session room
        const io = req.app.get('io');
        io.to(`session:${session.accessCode.toUpperCase()}`).emit('state:changed');

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
import { getSongsCollection } from '../models/Song.js';

// Helper to fetch song data if not embedded
async function populateSessionSong(session: any) {
    if (!session.currentSong && session.currentSongId) {
        const songDoc = await getSongsCollection().doc(session.currentSongId).get();
        if (songDoc.exists) {
            const songData = songDoc.data();
            return {
                id: songDoc.id,
                title: songData?.title,
                author: songData?.author,
                originalKey: songData?.originalKey,
                parts: songData?.parts
            };
        }
    }
    return session.currentSong || null;
}

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

        const currentSong = await populateSessionSong(session);

        // Return full session state for TanStack Query sync
        return res.json({
            id: session.id,
            accessCode: session.accessCode,
            status: session.status,
            currentSongId: session.currentSongId,
            currentSong,
            currentPartIndex: session.currentPartIndex,
            displayKey: session.displayKey,
            chordStyle: session.chordStyle,
            sessionPlaylist: session.sessionPlaylist || [],
        });
    } catch (error) {
        console.error('Error joining session:', error);
        return res.status(500).json({ error: 'Failed to join session' });
    }
});

/**
 * GET /api/sessions/song/:accessCode/:songId
 * Get song data for a live session viewer (PUBLIC - no auth required)
 * Only returns song if it matches the current session song
 */
router.get('/song/:accessCode/:songId', async (req, res) => {
    try {
        const { accessCode, songId } = req.params;

        // Verify the session exists and is active
        const session = await getLiveSessionByCode(accessCode.toUpperCase());
        if (!session || session.status !== 'active') {
            return res.status(404).json({ error: 'Session not found or ended' });
        }

        // Only allow fetching the song that's currently in the session
        if (session.currentSongId !== songId) {
            return res.status(403).json({ error: 'Song not available in this session' });
        }

        // Fetch the song
        const songDoc = await getSongsCollection().doc(songId).get();
        if (!songDoc.exists) {
            return res.status(404).json({ error: 'Song not found' });
        }

        const song = songDoc.data();
        return res.json({
            id: songDoc.id,
            title: song?.title,
            author: song?.author,
            originalKey: song?.originalKey,
            parts: song?.parts,
        });
    } catch (error) {
        console.error('Error fetching session song:', error);
        return res.status(500).json({ error: 'Failed to fetch song' });
    }
});

/**
 * GET /api/sessions/presenter/:presenterCode
 * Join a session as presenter (PUBLIC - no auth required, uses presenter code)
 */
router.get('/presenter/:presenterCode', async (req, res) => {
    try {
        const { presenterCode } = req.params;

        const session = await getLiveSessionByPresenterCode(presenterCode.toUpperCase());
        if (!session) {
            return res.status(404).json({ error: 'Session not found or ended' });
        }

        const currentSong = await populateSessionSong(session);

        // Return session info including ID for updates
        return res.json({
            id: session.id,
            accessCode: session.accessCode, // So presenter can see viewer link
            presenterCode: session.presenterCode,
            status: session.status,
            currentSongId: session.currentSongId,
            currentSong,
            currentPartIndex: session.currentPartIndex,
            displayKey: session.displayKey,
            chordStyle: session.chordStyle,
            sessionPlaylist: session.sessionPlaylist || [],
        });
    } catch (error) {
        console.error('Error joining as presenter:', error);
        return res.status(500).json({ error: 'Failed to join session' });
    }
});

/**
 * PUT /api/sessions/presenter/:presenterCode
 * Update session state as presenter (PUBLIC - authenticated by presenter code)
 */
router.put('/presenter/:presenterCode', async (req, res) => {
    try {
        const { presenterCode } = req.params;
        const { currentSongId, currentSong, currentPartIndex, displayKey, chordStyle, sessionPlaylist } = req.body;

        const session = await getLiveSessionByPresenterCode(presenterCode.toUpperCase());
        if (!session) {
            return res.status(404).json({ error: 'Session not found or ended' });
        }

        const updates: Record<string, unknown> = {};
        if (currentSongId !== undefined) updates.currentSongId = currentSongId;
        if (currentSong !== undefined) updates.currentSong = currentSong;
        if (currentPartIndex !== undefined) updates.currentPartIndex = currentPartIndex;
        if (displayKey !== undefined) updates.displayKey = displayKey;
        if (chordStyle !== undefined) updates.chordStyle = chordStyle;
        if (sessionPlaylist !== undefined) updates.sessionPlaylist = sessionPlaylist;

        await updateLiveSession(session.id, updates);

        // Emit state change to all clients in the session room
        const io = req.app.get('io');
        io.to(`session:${session.accessCode.toUpperCase()}`).emit('state:changed');

        return res.json({ success: true });
    } catch (error) {
        console.error('Error updating session as presenter:', error);
        return res.status(500).json({ error: 'Failed to update session' });
    }
});

/**
 * PUT /api/sessions/update/:accessCode
 * Update session state by access code (PUBLIC - used by generic session hook)
 * This allows both owner and presenter to use the same hook
 */
router.put('/update/:accessCode', async (req, res) => {
    try {
        const { accessCode } = req.params;
        const { currentSongId, currentSong, currentPartIndex, displayKey, chordStyle, sessionPlaylist } = req.body;

        const session = await getLiveSessionByCode(accessCode.toUpperCase());
        if (!session) {
            return res.status(404).json({ error: 'Session not found or ended' });
        }

        const updates: Record<string, unknown> = {};
        if (currentSongId !== undefined) updates.currentSongId = currentSongId;
        if (currentSong !== undefined) updates.currentSong = currentSong;
        if (currentPartIndex !== undefined) updates.currentPartIndex = currentPartIndex;
        if (displayKey !== undefined) updates.displayKey = displayKey;
        if (chordStyle !== undefined) updates.chordStyle = chordStyle;
        if (sessionPlaylist !== undefined) updates.sessionPlaylist = sessionPlaylist;

        await updateLiveSession(session.id, updates);

        // Emit state change to all clients in the session room
        const io = req.app.get('io');
        io.to(`session:${accessCode.toUpperCase()}`).emit('state:changed');

        return res.json({ success: true });
    } catch (error) {
        console.error('Error updating session:', error);
        return res.status(500).json({ error: 'Failed to update session' });
    }
});

export default router;
