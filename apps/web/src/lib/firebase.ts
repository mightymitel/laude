import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider, FacebookAuthProvider, OAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase only once
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (typeof window !== 'undefined') { // Vite is always client-side, but this check is fine
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApps()[0]!;
    }
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    // Emulator Suite wiring (dev runs against demo-laude, never a real
    // project). The emulator host follows the PAGE's host so LAN devices
    // (a phone on the wifi) reach the dev box's emulators, not themselves.
    if (import.meta.env.VITE_USE_EMULATOR === '1') {
        const emulatorHost = window.location.hostname;
        connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
        connectFirestoreEmulator(db, emulatorHost, 8080);
        connectStorageEmulator(storage, emulatorHost, 9199);
    }
}

// Auth providers
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

export { auth, db, storage };
export default app!;
