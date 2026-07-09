/**
 * Optional Firestore mirror (`liveSessions`) — durability + relay-restart
 * catch-up ONLY. Written by the relay through the Admin SDK; clients never
 * read or write it (no security rule exposes it). Best-effort: mirror
 * failures are logged once and never block the live path.
 */
import type { SessionState } from '@laude/session';
import type { SessionStore } from './state';
import { firestore } from './firebase';

const COLLECTION = 'liveSessions';
const DEBOUNCE_MS = 500;

const timers = new Map<string, NodeJS.Timeout>();
let warned = false;

function mirrorDoc(session: SessionState): Record<string, unknown> {
  // Roster + DJ manifest are transient (presence) — never persisted.
  const { presenters: _p, dj_manifest: _m, ...durable } = session;
  return durable;
}

/** Debounced best-effort write of one session's durable state. */
export function mirrorSession(session: SessionState): void {
  const db = firestore();
  if (!db) return;
  const existing = timers.get(session.id);
  if (existing) clearTimeout(existing);
  timers.set(
    session.id,
    setTimeout(() => {
      timers.delete(session.id);
      db.collection(COLLECTION)
        .doc(session.id)
        .set(mirrorDoc(session))
        .catch((err: unknown) => {
          if (!warned) {
            warned = true;
            console.warn('relay: Firestore mirror write failed (will keep trying silently)', err);
          }
        });
    }, DEBOUNCE_MS),
  );
}

/** Relay boot: reload active sessions so live links survive a restart. */
export async function rehydrate(store: SessionStore): Promise<number> {
  const db = firestore();
  if (!db) return 0;
  try {
    const snap = await db.collection(COLLECTION).where('status', '==', 'active').get();
    let count = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (typeof data.accessCode === 'string' && typeof data.ownerId === 'string') {
        // Boundary cast: the mirror is written exclusively by mirrorDoc() above,
        // so a durable doc IS a SessionState minus the transient fields
        // (restore() re-defaults those). Spot-checked keys guard against
        // foreign docs.
        store.restore({ ...(data as unknown as SessionState), id: doc.id });
        count += 1;
      }
    }
    return count;
  } catch (err) {
    console.warn('relay: mirror rehydrate failed — starting empty', err);
    return 0;
  }
}
