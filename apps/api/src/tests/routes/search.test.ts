import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

// Optional auth: an Authorization header resolves to the demo owner id.
jest.mock('../../middleware/auth.js', () => ({
    authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
        req.userId = 'owner-1';
        next();
    },
    optionalAuthMiddleware: (req: Request, _res: Response, next: NextFunction) => {
        // Test double mirrors WP-113: req.userId IS the (mock) uid carried by
        // the bearer token.
        const header = req.headers.authorization;
        if (typeof header === 'string' && header.startsWith('Bearer ')) {
            req.userId = header.slice('Bearer '.length);
        }
        next();
    },
}));

function doc(id: string, fields: Record<string, unknown>) {
    return { id, get: (name: string) => fields[name] };
}

const songsDocs = [
    doc('song-public', {
        title: 'Ce mare esti',
        author: 'Trad.',
        language: 'ro',
        libraryType: 'official',
        visibility: 'public',
        ownerId: null,
        parts: [{ lines: [{ text: '[1]Ce mare esti Tu, [4]Doamne' }] }],
    }),
    doc('song-private', {
        title: 'Cantec privat',
        language: 'ro',
        libraryType: 'user',
        visibility: 'private',
        ownerId: 'owner-1',
        parts: [{ lines: [{ text: '[1]Har uimitor si sfant' }] }],
    }),
    doc('song-en', {
        title: 'Amazing Grace',
        language: 'en',
        libraryType: 'official',
        visibility: 'public',
        ownerId: null,
        parts: [{ lines: [{ text: '[1]Amazing grace, how sweet the sound' }] }],
    }),
];

const lyricsDocs = [
    doc('song-public-ro', {
        song_id: 'song-public',
        chordpro: '{key: G}\n[1]Ce mare esti Tu, [4]Doamne\n[5]Sufletul meu canta',
    }),
];

jest.mock('../../config/firebase', () => ({
    getFirestore: jest.fn(() => ({
        collection: (name: string) => ({
            get: () =>
                Promise.resolve({ docs: name === 'songs' ? songsDocs : lyricsDocs }),
        }),
    })),
    getFirebaseAuth: jest.fn(),
    initializeFirebase: jest.fn(),
    isFirebaseInitialized: jest.fn(() => false),
}));

import { app } from '../../index';
import { invalidateLyricsIndex } from '../../search/lyricsIndex';

beforeEach(() => invalidateLyricsIndex());

describe('GET /api/search/lyrics', () => {
    it('finds songs by lyric content, not just title', async () => {
        const res = await request(app).get('/api/search/lyrics?q=sufletul meu canta');
        expect(res.status).toBe(200);
        expect(res.body.results[0].song_id).toBe('song-public');
        expect(res.body.results[0].snippet).toContain('Sufletul meu');
    });

    it('hides private songs from anonymous callers', async () => {
        const res = await request(app).get('/api/search/lyrics?q=har uimitor');
        expect(res.status).toBe(200);
        expect(res.body.results).toHaveLength(0);
    });

    it('shows an authed caller their own private songs', async () => {
        const res = await request(app)
            .get('/api/search/lyrics?q=har uimitor')
            .set('Authorization', 'Bearer owner-1');
        expect(res.status).toBe(200);
        expect(res.body.results.map((r: { song_id: string }) => r.song_id)).toEqual([
            'song-private',
        ]);
    });

    it('a private song is INVISIBLE to a second authed account (WP-113)', async () => {
        const res = await request(app)
            .get('/api/search/lyrics?q=har uimitor')
            .set('Authorization', 'Bearer owner-2');
        expect(res.status).toBe(200);
        expect(res.body.results).toHaveLength(0);
    });

    it('filters by language', async () => {
        const res = await request(app).get('/api/search/lyrics?q=amazing&language=ro');
        expect(res.body.results).toHaveLength(0);
        const en = await request(app).get('/api/search/lyrics?q=amazing&language=en');
        expect(en.body.results.map((r: { song_id: string }) => r.song_id)).toEqual(['song-en']);
    });

    it('returns nothing for sub-2-char queries (no keystroke storms)', async () => {
        const res = await request(app).get('/api/search/lyrics?q=a');
        expect(res.status).toBe(200);
        expect(res.body.results).toEqual([]);
    });
});
