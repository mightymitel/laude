/**
 * GET /api/search/lyrics?q=&language=&limit= — real-time as-you-type lyrics
 * search (WP-105, DEC-69). Mounted with OPTIONAL auth: anonymous/link-joined
 * callers see public + official songs; an authed caller additionally sees
 * their own private songs. Serves both presenter search and the mint-or-link
 * bridge's candidate matcher.
 */
import { Router, type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { invalidateLyricsIndex, searchLyrics } from '../search/lyricsIndex.js';

const router = Router();

/** Authed writers that bypass the api's song routes (Studio's mint writes
 * Firestore directly as the user — WP-114) ping this so a fresh mint is
 * searchable immediately instead of after the TTL. */
router.post('/reindex', (req: AuthenticatedRequest, res: Response) => {
    if (!req.userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    invalidateLyricsIndex();
    res.json({ ok: true });
});

router.get('/lyrics', async (req: AuthenticatedRequest, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.trim().length < 2) {
        res.json({ results: [] });
        return;
    }
    const language = typeof req.query.language === 'string' ? req.query.language : undefined;
    const rawLimit = Number(req.query.limit);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 25) : 10;
    try {
        // One identity namespace (WP-113): req.userId IS the Firebase uid.
        const results = await searchLyrics(q, { language, viewerId: req.userId, limit });
        res.json({ results });
    } catch (error) {
        console.error('lyrics search failed:', error);
        res.status(500).json({ error: 'search failed' });
    }
});

export default router;
