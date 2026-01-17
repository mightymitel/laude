import { getFirestore } from '../config/firebase.js';
import type { Key, ChordStyle } from '@laudasist/shared';

export interface LiveSession {
    id: string;
    ownerId: string;
    accessCode: string;      // 6-char alphanumeric code for sharing
    status: 'active' | 'ended';

    // Current state (synced to viewers)
    currentSongId: string | null;
    currentPartIndex: number;
    displayKey: Key;
    chordStyle: ChordStyle;

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

    const session: Omit<LiveSession, 'id'> = {
        ownerId,
        accessCode,
        status: 'active',
        currentSongId: null,
        currentPartIndex: 0,
        displayKey: 'C',
        chordStyle: 'letters',
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
    const snapshot = await collection
        .where('accessCode', '==', accessCode)
        .where('status', '==', 'active')
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    if (!doc) return null;

    return { id: doc.id, ...doc.data() } as LiveSession;
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
