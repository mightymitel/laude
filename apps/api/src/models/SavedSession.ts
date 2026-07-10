import { getFirestore } from '../config/firebase.js';

/**
 * The persisted session, NARROW by decision (DEC-96/99): a named,
 * owner-scoped document holding a playlist BY-VALUE that can go live
 * repeatedly, plus the "my sessions" list. Deliberately absent: any
 * Edit/Live/Archived lifecycle, church scoping, comments, persisted
 * viewport setups — those stay with Flow 4, deferred.
 *
 * Items ride the portable-playlist item shape (@laude/session
 * SessionPlaylistItem): by-value `song` payloads so a prepared set keeps
 * working for private songs, offline edits and guests joining on the night.
 */
export interface SavedSessionItem {
    id: string;
    songId: string;
    key?: string;
    arrangement?: string;
    song?: unknown; // EmbeddedSong by-value payload; opaque to the api
}

export interface SavedSession {
    id: string;
    ownerId: string;
    name: string;
    items: SavedSessionItem[];
    createdAt: Date;
    updatedAt: Date;
}

const COLLECTION = 'sessions';

export function getSavedSessionsCollection() {
    return getFirestore().collection(COLLECTION);
}

function fromDoc(doc: FirebaseFirestore.DocumentSnapshot): SavedSession {
    const data = doc.data() ?? {};
    return {
        id: doc.id,
        ownerId: String(data.ownerId ?? ''),
        name: String(data.name ?? ''),
        items: Array.isArray(data.items) ? (data.items as SavedSessionItem[]) : [],
        createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? new Date(0),
        updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt ?? new Date(0),
    };
}

export async function createSavedSession(
    ownerId: string,
    name: string,
    items: SavedSessionItem[],
): Promise<SavedSession> {
    const now = new Date();
    const ref = await getSavedSessionsCollection().add({
        ownerId,
        name,
        items,
        createdAt: now,
        updatedAt: now,
    });
    return { id: ref.id, ownerId, name, items, createdAt: now, updatedAt: now };
}

export async function getSavedSessionsByOwner(ownerId: string): Promise<SavedSession[]> {
    const snap = await getSavedSessionsCollection()
        .where('ownerId', '==', ownerId)
        .get();
    return snap.docs
        .map(fromDoc)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getSavedSessionById(id: string): Promise<SavedSession | null> {
    const doc = await getSavedSessionsCollection().doc(id).get();
    return doc.exists ? fromDoc(doc) : null;
}

export async function updateSavedSession(
    id: string,
    updates: { name?: string; items?: SavedSessionItem[] },
): Promise<SavedSession | null> {
    const ref = getSavedSessionsCollection().doc(id);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.items !== undefined) patch.items = updates.items;
    await ref.update(patch);
    const doc = await ref.get();
    return doc.exists ? fromDoc(doc) : null;
}

export async function deleteSavedSession(id: string): Promise<void> {
    await getSavedSessionsCollection().doc(id).delete();
}
