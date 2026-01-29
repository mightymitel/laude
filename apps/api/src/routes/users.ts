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
                    originalKey: data?.originalKey,
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
