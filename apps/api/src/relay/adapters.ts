/**
 * Cloud-host adapters for @laude/relay (DEC-52/WP-95): Firebase ID-token
 * verification for owner endpoints and the Firestore `liveSessions` mirror
 * (Admin-only — no security rule exposes it; clients never read or write it).
 * The relay package itself has no firebase-admin dependency; LAN builds
 * construct it with no adapters at all.
 */
import type { MirrorStoreAdapter, RelayAdapters } from '@laude/relay';
import { getFirebaseAuth, getFirestore, isFirebaseInitialized } from '../config/firebase.js';

const MIRROR_COLLECTION = 'liveSessions';

function firestoreMirror(): MirrorStoreAdapter {
    return {
        async set(sessionId, durable) {
            await getFirestore().collection(MIRROR_COLLECTION).doc(sessionId).set(durable);
        },
        async listActive() {
            const snap = await getFirestore()
                .collection(MIRROR_COLLECTION)
                .where('status', '==', 'active')
                .get();
            return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
        },
    };
}

/** Firebase-backed adapters, or none when the api runs without Firebase. */
export function relayAdapters(): RelayAdapters {
    if (!isFirebaseInitialized()) return {};
    return {
        verifyOwnerToken: async (token) => {
            try {
                const decoded = await getFirebaseAuth().verifyIdToken(token);
                return decoded.uid;
            } catch {
                return null;
            }
        },
        mirror: firestoreMirror(),
    };
}
