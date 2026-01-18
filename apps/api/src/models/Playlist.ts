import { getFirestore } from '../config/firebase.js';
import type { Key } from '../shared/index.js';

export interface PlaylistItem {
    id: string;
    songId: string;
    key?: Key;              // Override song's original key
    arrangement?: string;   // Arrangement ID override
    order: number;
}

export interface Playlist {
    id: string;
    ownerId: string;        // userId (later: churchId)
    name: string;
    description?: string;
    items: PlaylistItem[];
    createdAt: Date;
    updatedAt: Date;
}

export function getPlaylistsCollection() {
    return getFirestore().collection('playlists');
}

export async function createPlaylist(
    ownerId: string,
    name: string,
    description?: string
): Promise<Playlist> {
    const collection = getPlaylistsCollection();
    const now = new Date();

    const playlist: Omit<Playlist, 'id'> = {
        ownerId,
        name,
        description,
        items: [],
        createdAt: now,
        updatedAt: now,
    };

    const docRef = await collection.add({
        ...playlist,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
    });

    return { id: docRef.id, ...playlist };
}

export async function getPlaylistsByOwner(ownerId: string): Promise<Playlist[]> {
    const collection = getPlaylistsCollection();
    const snapshot = await collection
        .where('ownerId', '==', ownerId)
        .orderBy('updatedAt', 'desc')
        .get();

    return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: new Date(doc.data().createdAt),
        updatedAt: new Date(doc.data().updatedAt),
    })) as Playlist[];
}

export async function getPlaylistById(id: string): Promise<Playlist | null> {
    const collection = getPlaylistsCollection();
    const doc = await collection.doc(id).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data()!;
    return {
        id: doc.id,
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
    } as Playlist;
}

export async function updatePlaylist(
    id: string,
    updates: Partial<Pick<Playlist, 'name' | 'description' | 'items'>>
): Promise<Playlist | null> {
    const collection = getPlaylistsCollection();
    const docRef = collection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
        return null;
    }

    const now = new Date();
    await docRef.update({
        ...updates,
        updatedAt: now.toISOString(),
    });

    const updated = await docRef.get();
    const data = updated.data()!;

    return {
        id: updated.id,
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
    } as Playlist;
}

export async function deletePlaylist(id: string): Promise<boolean> {
    const collection = getPlaylistsCollection();
    const docRef = collection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
        return false;
    }

    await docRef.delete();
    return true;
}

// Helper to generate unique playlist item IDs
export function generatePlaylistItemId(): string {
    return Math.random().toString(36).substring(2, 10);
}
