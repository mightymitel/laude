import admin from 'firebase-admin';

let initialized = false;

export function initializeFirebase(): void {
    if (initialized) return;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (!projectId || !privateKey || !clientEmail) {
        console.warn('⚠️ Firebase Admin SDK credentials not configured. Auth will be disabled.');
        return;
    }

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            privateKey,
            clientEmail,
        }),
    });

    initialized = true;
    console.log('✅ Firebase Admin SDK initialized');
}

export function getFirebaseAuth(): admin.auth.Auth {
    return admin.auth();
}

export function getFirestore(): admin.firestore.Firestore {
    return admin.firestore();
}

export function isFirebaseInitialized(): boolean {
    return initialized;
}
