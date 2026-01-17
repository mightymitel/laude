import request from 'supertest';
import { app } from '../../index';
import { getSongsCollection } from '../../models/Song';
import { getFirestore } from '../../config/firebase';

// Mock Song Model
jest.mock('../../models/Song', () => ({
    getSongsCollection: jest.fn()
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
    isFirebaseInitialized: jest.fn(() => true)
}));

// Mock auth middleware
jest.mock('../../middleware/auth', () => ({
    authMiddleware: (req: any, _res: any, next: any) => {
        req.userId = 'test-user-id';
        next();
    },
}));

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

(getFirestore as jest.Mock).mockReturnValue({
    collection: jest.fn().mockReturnValue(mockCollection)
});

(getSongsCollection as jest.Mock).mockReturnValue(mockCollection);


describe('Song Routes', () => {
    // app is imported

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

            const res = await request(app).get('/api/songs');

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe('Amazing Grace');

            // Verify default filter (ownerId = me)
            expect(mockCollection.where).toHaveBeenCalledWith('ownerId', '==', 'test-user-id');
        });
    });

    describe('POST /api/songs', () => {
        it('should create a new song', async () => {
            const newSongData = {
                title: 'New Song',
                originalKey: 'C',
                parts: []
            };

            mockCollection.add.mockResolvedValue({ id: 'new-song-id' });

            const res = await request(app)
                .post('/api/songs')
                .send(newSongData);

            expect(res.status).toBe(201);
            expect(res.body.id).toBe('new-song-id');
            expect(mockCollection.add).toHaveBeenCalled();
        });
    });
});
