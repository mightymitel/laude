/**
 * Firebase bootstrap — EMULATOR ONLY (PoC rule: never a real project).
 * Firestore emulator: 127.0.0.1:8080, project demo-laude. No auth needed.
 */
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const app = initializeApp({
  projectId: 'demo-laude',
  apiKey: 'demo-key',
  appId: 'demo',
});

export const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
