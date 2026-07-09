import admin from 'firebase-admin';

let initialized = false;

export function initializeFirebase(): void {
    if (initialized) return;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    // Emulator Suite: firebase-admin auto-detects FIRESTORE_EMULATOR_HOST /
    // FIREBASE_AUTH_EMULATOR_HOST; it only needs a project id and no credentials.
    if (process.env.FIRESTORE_EMULATOR_HOST) {
        admin.initializeApp({ projectId: projectId || 'demo-laude' });
        console.log(
            `✅ Firebase Admin SDK initialized against the EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST}, project ${projectId || 'demo-laude'})`,
        );
        initialized = true;
        return;
    }

    // Check if explicit credentials are provided
    if (projectId && privateKey && clientEmail) {
        // Use explicit service account credentials (local development)
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                privateKey,
                clientEmail,
            }),
        });
        console.log('✅ Firebase Admin SDK initialized with service account');
    } else {
        // Use Application Default Credentials (Firebase App Hosting, Cloud Run, etc.)
        // Firebase App Hosting automatically provides GOOGLE_APPLICATION_CREDENTIALS
        try {
            admin.initializeApp();
            console.log('✅ Firebase Admin SDK initialized with ADC');
        } catch (error) {
            console.error('❌ Failed to initialize Firebase Admin SDK:', error);
            return;
        }
    }

    initialized = true;
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
