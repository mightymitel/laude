import { Request, Response, NextFunction } from 'express';
import { getFirebaseAuth, isFirebaseInitialized } from '../config/firebase.js';
import { getUsersCollection, UserDocument } from '../models/User.js';
import type { UserRole, ChordStyle } from '../shared/index.js';

export interface AuthenticatedRequest extends Request {
    userId?: string;
    userEmail?: string;
    firebaseUid?: string;
}

export async function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing authorization header' });
        return;
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
        res.status(401).json({ error: 'Invalid token format' });
        return;
    }

    // If Firebase is not initialized (dev mode), skip verification
    if (!isFirebaseInitialized()) {
        // In dev mode, expect the token to be a user ID
        req.userId = token;
        next();
        return;
    }

    try {
        const decodedToken = await getFirebaseAuth().verifyIdToken(token);
        req.firebaseUid = decodedToken.uid;
        req.userEmail = decodedToken.email;

        // ONE canonical identity (WP-113): the Firebase uid. The users
        // document's id IS the uid — no second identity namespace, so every
        // ownership stamp (songs.ownerId, playlists.ownerId, createdBy)
        // agrees with what security rules and Studio's mint see.
        const usersRef = getUsersCollection();
        const userDoc = usersRef.doc(decodedToken.uid);
        const snapshot = await userDoc.get();

        if (!snapshot.exists) {
            const newUser: UserDocument = {
                firebaseUid: decodedToken.uid,
                email: decodedToken.email || '',
                displayName: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
                photoURL: decodedToken.picture || null,
                authProvider: getAuthProvider(decodedToken),
                roles: [{ role: 'user' }] as UserRole[],
                churchSubscriptions: [],
                favoriteKey: null,
                defaultChordStyle: 'letters' as ChordStyle,
                favoriteSongs: [],
                createdAt: new Date(),
                lastLoginAt: new Date(),
            };
            await userDoc.set(newUser);
        }

        req.userId = decodedToken.uid;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function getAuthProvider(
    decodedToken: { firebase?: { sign_in_provider?: string } }
): 'google' | 'facebook' | 'apple' | 'email' {
    const provider = decodedToken.firebase?.sign_in_provider;
    if (provider?.includes('google')) return 'google';
    if (provider?.includes('facebook')) return 'facebook';
    if (provider?.includes('apple')) return 'apple';
    return 'email';
}

/**
 * Optional auth middleware - doesn't fail if no token, but populates user if present
 */
export async function optionalAuthMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        next();
        return;
    }

    // Try to authenticate, but don't fail if it doesn't work
    try {
        await authMiddleware(req, res, () => { });
        next();
    } catch {
        next();
    }
}
