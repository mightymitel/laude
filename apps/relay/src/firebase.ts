/**
 * Optional Firebase Admin wiring: ID-token verification for the owner
 * endpoints + the Firestore mirror. The relay runs WITHOUT Firebase too
 * (LAN/offline mode) — everything here degrades gracefully.
 */
import admin from 'firebase-admin';

let initialized = false;
let available = false;

export function initFirebase(): void {
  if (initialized) return;
  initialized = true;

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-laude' });
    available = true;
    console.log(`relay: Firebase Admin against the EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})`);
    return;
  }
  // initializeApp() never throws without credentials — it fails later, on
  // first use. Only trust Firebase when the environment actually provides
  // credentials; otherwise run in offline/LAN mode.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_CONFIG) {
    admin.initializeApp();
    available = true;
    console.log('relay: Firebase Admin initialized (ADC)');
    return;
  }
  available = false;
  console.log('relay: no Firebase — running offline (LAN mode), mirror + token verify disabled');
}

export function firebaseAvailable(): boolean {
  return available;
}

/**
 * Resolve the owner id from a Bearer token. With Firebase: a verified ID
 * token's uid. Offline/LAN mode: the raw token IS the owner id (guests may
 * host LAN sessions — Decision Log 2026-07-08).
 */
export async function ownerIdFromToken(token: string): Promise<string | null> {
  if (!available) return token || null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export function firestore(): admin.firestore.Firestore | null {
  return available ? admin.firestore() : null;
}
