import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { app } from '../../index';

// Mock Song Model (Firestore Collection)
const mockCollection = {
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(),
    add: jest.fn(),
    doc: jest.fn(),
};

// Mock auth middleware
jest.mock('../../middleware/auth.js', () => ({
    authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
        req.userId = 'test-user-id';
        next();
    },
    optionalAuthMiddleware: (_req: Request, _res: Response, next: NextFunction) => {
        next();
    },
}));

// Mock Firebase Admin
jest.mock('../../config/firebase', () => ({
    getFirestore: jest.fn(),
    getFirebaseAuth: jest.fn(() => ({
        verifyIdToken: jest.fn().mockResolvedValue({
            uid: 'test-user-id',
            email: 'test@example.com'
        })
    })),
    initializeFirebase: jest.fn(),
    isFirebaseInitialized: jest.fn(() => false)
}));

import { getFirestore } from '../../config/firebase';
import { getSongsCollection } from '../../models/Song';
import { getSongLyricsCollection } from '../../models/SongLyrics';

// Mock Song Model
jest.mock('../../models/Song', () => ({
    getSongsCollection: jest.fn()
}));

// Mock SongLyrics Model (the denormalized chart written alongside the song)
const mockLyricsDoc = { set: jest.fn().mockResolvedValue(undefined), delete: jest.fn() };
const mockLyricsCollection = {
    doc: jest.fn().mockReturnValue(mockLyricsDoc),
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [] }),
};
jest.mock('../../models/SongLyrics', () => ({
    getSongLyricsCollection: jest.fn(),
    songLyricsDocId: (songId: string, language: string) => `${songId}-${language}`,
}));

describe('Song Routes', () => {
    // app is imported

    beforeEach(() => {
        (getFirestore as jest.Mock).mockReturnValue({
            collection: jest.fn().mockReturnValue(mockCollection)
        });
        (getSongsCollection as jest.Mock).mockReturnValue(mockCollection);
        (getSongLyricsCollection as jest.Mock).mockReturnValue(mockLyricsCollection);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/songs', () => {
        it('should list songs with default filter', async () => {
            // Mock Firestore response
            mockCollection.get.mockResolvedValue({
                docs: [
                    {
                        id: 'song1',
                        data: () => ({
                            title: 'Amazing Grace',
                            author: 'John Newton',
                            libraryType: 'user',
                            ownerId: 'test-db-user-id',
                            visibility: 'private',
                            createdAt: new Date()
                        })
                    }
                ],
                size: 1
            });

            const res = await request(app)
                .get('/api/songs')
                .set('Authorization', 'Bearer test-user-id');

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe('Amazing Grace');

            // Verify default filter (ownerId = me)
            expect(mockCollection.where).toHaveBeenCalledWith('ownerId', '==', 'test-user-id');
        });
    });

    describe('POST /api/songs', () => {
        it('should create a new song with the merged platform shape + denormalized lyrics', async () => {
            const newSongData = {
                title: 'New Song',
                defaultKey: 'C',
                parts: [
                    { id: 'V1', type: 'verse', index: 1, lines: [{ text: '[1]la [4]la' }] }
                ]
            };

            mockCollection.add.mockResolvedValue({ id: 'new-song-id' });

            const res = await request(app)
                .post('/api/songs')
                .set('Authorization', 'Bearer test-user-id')
                .send(newSongData);

            expect(res.status).toBe(201);
            expect(res.body.id).toBe('new-song-id');
            const written = mockCollection.add.mock.calls[0][0];
            // Platform contract fields ride along (merged shape)
            expect(written.canonical_title).toBe('New Song');
            expect(written.default_key).toBe('C');
            expect(written.language).toBe('ro');
            // Imports/new songs land PRIVATE (DEC-108)
            expect(written.visibility).toBe('private');
            // The degree chart lands in song_lyrics with visibility denormalized (DEC-32)
            expect(mockLyricsCollection.doc).toHaveBeenCalledWith('new-song-id-ro');
            const lyrics = mockLyricsDoc.set.mock.calls[0][0];
            expect(lyrics.song_id).toBe('new-song-id');
            expect(lyrics.visibility).toBe('private');
            expect(lyrics.chordpro).toContain('{key: C}');
            expect(lyrics.chordpro).toContain('[1]la [4]la');
        });

        it('rejects a chart that does not survive the degree round-trip', async () => {
            const res = await request(app)
                .post('/api/songs')
                .set('Authorization', 'Bearer test-user-id')
                .send({
                    title: 'Broken\nSong',
                    defaultKey: 'not-a-key {',
                    parts: [{ id: 'V1', type: 'verse', index: 1, lines: [{ text: '{unclosed' }] }]
                });

            expect(res.status).toBe(400);
            expect(mockCollection.add).not.toHaveBeenCalled();
        });
    });
});
