import { getFirestore } from '../config/firebase.js';
import type { Key, ChordStyle, SongPart } from '../shared/index.js';

// Embedded song data for presenter access (no library fetch needed)
export interface EmbeddedSong {
    id: string;
    title: string;
    author?: string;
    originalKey: Key;
    parts: SongPart[];
}

export interface SessionPlaylistItem {
    id: string;
    songId: string;
    key?: Key;
    arrangement?: string;
    song?: EmbeddedSong;  // Full song data for presenter
    temporary?: boolean;  // Auto-added when owner selects a song not in playlist
}

export interface LiveSession {
    id: string;
    ownerId: string;
    accessCode: string;      // 6-char alphanumeric code for viewers
    presenterCode: string;   // 6-char alphanumeric code for presenters
    status: 'active' | 'ended';

    // Current state (synced to viewers)
    currentSongId: string | null;
    currentSong?: EmbeddedSong;  // Full song data for presenter/viewer
    currentPartIndex: number;
    displayKey: Key;
    chordStyle: ChordStyle;

    // Session playlist (shared with presenters)
    sessionPlaylist: SessionPlaylistItem[];

    createdAt: Date;
    endedAt?: Date;
}

export function getLiveSessionsCollection() {
    return getFirestore().collection('liveSessions');
}

export function generateAccessCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export async function createLiveSession(ownerId: string): Promise<LiveSession> {
    const collection = getLiveSessionsCollection();
    const accessCode = generateAccessCode();
    const presenterCode = generateAccessCode(); // Separate code for presenters

    const session: Omit<LiveSession, 'id'> = {
        ownerId,
        accessCode,
        presenterCode,
        status: 'active',
        currentSongId: null,
        currentPartIndex: 0,
        displayKey: 'C',
        chordStyle: 'letters',
        sessionPlaylist: [],
        createdAt: new Date(),
    };

    const docRef = await collection.add({
        ...session,
        createdAt: new Date().toISOString(),
    });

    return { id: docRef.id, ...session };
}

export async function getLiveSessionByCode(accessCode: string): Promise<LiveSession | null> {
    const collection = getLiveSessionsCollection();
    // Query by accessCode only to avoid composite index requirement
    const snapshot = await collection
        .where('accessCode', '==', accessCode)
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    if (!doc) return null;

    const data = doc.data() as Omit<LiveSession, 'id'>;

    if (data.status !== 'active') return null; // Enforce active status in memory

    return { id: doc.id, ...data };
}

export async function getLiveSessionByPresenterCode(presenterCode: string): Promise<LiveSession | null> {
    const collection = getLiveSessionsCollection();
    // Query by presenterCode only to avoid composite index requirement
    const snapshot = await collection
        .where('presenterCode', '==', presenterCode)
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    if (!doc) return null;

    const data = doc.data() as Omit<LiveSession, 'id'>;

    if (data.status !== 'active') return null; // Enforce active status in memory

    return { id: doc.id, ...data };
}

export async function getLiveSessionById(id: string): Promise<LiveSession | null> {
    const doc = await getLiveSessionsCollection().doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as LiveSession;
}

export async function updateLiveSession(id: string, updates: Partial<LiveSession>): Promise<void> {
    await getLiveSessionsCollection().doc(id).update(updates);
}

export async function endLiveSession(id: string): Promise<void> {
    await getLiveSessionsCollection().doc(id).update({
        status: 'ended',
        endedAt: new Date().toISOString(),
    });
}

export async function getActiveSessionByOwner(ownerId: string): Promise<LiveSession | null> {
    const collection = getLiveSessionsCollection();
    const snapshot = await collection
        .where('ownerId', '==', ownerId)
        .where('status', '==', 'active')
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    if (!doc) return null;

    return { id: doc.id, ...doc.data() } as LiveSession;
}
