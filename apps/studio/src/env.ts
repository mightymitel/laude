/**
 * Emulator wiring. This module must be imported before anything that touches
 * firebase-admin so the SDK picks up the emulator hosts from the environment.
 * Defaults match the PoC Emulator Suite; explicit env vars still win.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

export const PROJECT_ID = 'demo-laude';
export const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
