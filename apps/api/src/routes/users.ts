import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getUsersCollection, UserDocument } from '../models/User.js';
import { getSongsCollection } from '../models/Song.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const router = Router();

/**
 * GET /api/users/me - Get current user profile
 */
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userDoc = await getUsersCollection().doc(req.userId!).get();

        if (!userDoc.exists) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const userData = userDoc.data() as UserDocument;

        res.json({
            id: userDoc.id,
            ...userData,
            // Convert timestamps if necessary, Firestore returns Timestamp objects
            createdAt: userData.createdAt instanceof Date ? userData.createdAt : (userData.createdAt as Timestamp)?.toDate(),
            lastLoginAt: userData.lastLoginAt instanceof Date ? userData.lastLoginAt : (userData.lastLoginAt as Timestamp)?.toDate(),
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

/**
 * PUT /api/users/me - Update current user profile
 */
router.put('/me', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { displayName, photoURL, favoriteKey, defaultChordStyle } = req.body;
        const userRef = getUsersCollection().doc(req.userId!);

        const updateData: Partial<UserDocument> = {
            lastLoginAt: new Date(),
        };

        if (displayName) updateData.displayName = displayName;
        if (photoURL !== undefined) updateData.photoURL = photoURL;
        if (favoriteKey) updateData.favoriteKey = favoriteKey;
        if (defaultChordStyle) updateData.defaultChordStyle = defaultChordStyle;

        await userRef.update(updateData);
        
        const updatedDoc = await userRef.get();
        const userData = updatedDoc.data() as UserDocument;

        res.json({
            id: updatedDoc.id,
            email: userData.email,
            displayName: userData.displayName,
            photoURL: userData.photoURL,
            favoriteKey: userData.favoriteKey,
            defaultChordStyle: userData.defaultChordStyle,
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user profile' });
    }
});

// Per-song personal prefs (WP-162 / DEC-133): users/{uid}/song_prefs/{songId}
// holds {favoriteKey, notes}. The record is deliberately extensible so
// DEC-138's personal arrangements (a collection + favorite-arrangement
// pointer) join THIS doc later with no migration (DEC-98).

const VALID_KEYS = new Set([
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
]);
const MAX_NOTES_LENGTH = 5000;

function songPrefsCollection(userId: string) {
    return getUsersCollection().doc(userId).collection('song_prefs');
}

/**
 * GET /api/users/me/song-prefs - All of the caller's per-song prefs, as a
 * map keyed by songId (small collection; one fetch feeds every surface).
 */
router.get('/me/song-prefs', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const snapshot = await songPrefsCollection(req.userId!).get();
        const prefs: Record<string, { favoriteKey?: string; notes?: string }> = {};
        for (const doc of snapshot.docs) {
            const data = doc.data();
            prefs[doc.id] = {
                ...(typeof data.favoriteKey === 'string' ? { favoriteKey: data.favoriteKey } : {}),
                ...(typeof data.notes === 'string' ? { notes: data.notes } : {}),
            };
        }
        res.json({ data: prefs });
    } catch (error) {
        console.error('Error fetching song prefs:', error);
        res.status(500).json({ error: 'Failed to fetch song prefs' });
    }
});

/**
 * PUT /api/users/me/song-prefs/:songId - Upsert {favoriteKey?, notes?}.
 * Passing null clears a field; a doc with no fields left is deleted.
 */
router.put('/me/song-prefs/:songId', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { favoriteKey, notes } = req.body as { favoriteKey?: unknown; notes?: unknown };

        if (favoriteKey !== undefined && favoriteKey !== null) {
            if (typeof favoriteKey !== 'string' || !VALID_KEYS.has(favoriteKey)) {
                res.status(400).json({ error: 'favoriteKey must be a valid key name' });
                return;
            }
        }
        if (notes !== undefined && notes !== null) {
            if (typeof notes !== 'string' || notes.length > MAX_NOTES_LENGTH) {
                res.status(400).json({ error: `notes must be a string of at most ${MAX_NOTES_LENGTH} characters` });
                return;
            }
        }

        const ref = songPrefsCollection(req.userId!).doc(req.params.songId!);
        const update: Record<string, unknown> = { updatedAt: new Date() };
        if (favoriteKey !== undefined) {
            update.favoriteKey = favoriteKey === null ? FieldValue.delete() : favoriteKey;
        }
        if (notes !== undefined) {
            update.notes = notes === null || notes === '' ? FieldValue.delete() : notes;
        }
        await ref.set(update, { merge: true });

        const doc = await ref.get();
        const data = doc.data() ?? {};
        const remaining = {
            ...(typeof data.favoriteKey === 'string' ? { favoriteKey: data.favoriteKey } : {}),
            ...(typeof data.notes === 'string' ? { notes: data.notes } : {}),
        };
        if (Object.keys(remaining).length === 0) {
            await ref.delete();
        }
        res.json({ songId: req.params.songId, ...remaining });
    } catch (error) {
        console.error('Error saving song prefs:', error);
        res.status(500).json({ error: 'Failed to save song prefs' });
    }
});

/**
 * GET /api/users/me/favorites - Get user's favorite songs
 */
router.get('/me/favorites', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userDoc = await getUsersCollection().doc(req.userId!).get();

        if (!userDoc.exists) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const userData = userDoc.data() as UserDocument;
        const favoriteIds = userData.favoriteSongs || [];

        if (favoriteIds.length === 0) {
            res.json({ data: [], total: 0 });
            return;
        }

        // Firestore 'in' query supports up to 10 items. For more, we might need multiple queries or just fetch all and filter (for small libraries)
        // Or fetch individually. For now, let's assume < 10 or fetch individually in parallel.
        // Actually, fetching individually is safer for potentially > 10
        
        const songsRefs = favoriteIds.map(id => getSongsCollection().doc(id).get());
        const songDocs = await Promise.all(songsRefs);
        
        const songs = songDocs
            .filter(doc => doc.exists)
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    title: data?.title,
                    author: data?.author,
                    defaultKey: data?.defaultKey,
                    tags: data?.tags,
                    libraryType: data?.libraryType,
                };
            });

        res.json({
            data: songs,
            total: songs.length,
        });
    } catch (error) {
        console.error('Error fetching favorites:', error);
        res.status(500).json({ error: 'Failed to fetch favorite songs' });
    }
});

/**
 * POST /api/users/me/favorites/:songId - Add song to favorites
 */
router.post('/me/favorites/:songId', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { songId } = req.params;
        const userRef = getUsersCollection().doc(req.userId!);

        await userRef.update({
            favoriteSongs: FieldValue.arrayUnion(songId)
        });

        const updatedDoc = await userRef.get();
        const userData = updatedDoc.data() as UserDocument;

        res.json({ success: true, favoriteSongs: userData.favoriteSongs });
    } catch (error) {
        console.error('Error adding favorite:', error);
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});

/**
 * DELETE /api/users/me/favorites/:songId - Remove song from favorites
 */
router.delete('/me/favorites/:songId', async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { songId } = req.params;
        const userRef = getUsersCollection().doc(req.userId!);

        await userRef.update({
            favoriteSongs: FieldValue.arrayRemove(songId)
        });

        const updatedDoc = await userRef.get();
        const userData = updatedDoc.data() as UserDocument;

        res.json({ success: true, favoriteSongs: userData.favoriteSongs });
    } catch (error) {
        console.error('Error removing favorite:', error);
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});

export default router;
