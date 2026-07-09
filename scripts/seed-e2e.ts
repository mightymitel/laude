/**
 * E2E fixture seed — Firebase EMULATOR only (refuses to run without emulator
 * env). Creates the Playwright test user + a couple of public songs so the
 * session/library flows have data. Idempotent.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const TEST_UID = 'e2e-test-user';
const TEST_EMAIL = 'testuser@test.com';
const TEST_PASSWORD = '12345678';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    console.error('seed-e2e: refusing to run without FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST');
    process.exit(1);
}

interface SeedSong {
    id: string;
    title: string;
    key: string;
    lines: { part: string; text: string[] }[];
}

const SONGS: SeedSong[] = [
    {
        id: 'e2e-song-amazing',
        title: 'Amazing Grace (E2E)',
        key: 'G',
        lines: [
            { part: 'verse', text: ['[1]Amazing [4]grace how [1]sweet the sound', 'That [1]saved a [5]wretch like [1]me'] },
            { part: 'chorus', text: ['[1]Praise the [4]Lord, [5]praise the [1]Lord'] },
        ],
    },
    {
        id: 'e2e-song-doxology',
        title: 'Doxology (E2E)',
        key: 'D',
        lines: [
            { part: 'verse', text: ['[1]Praise God from [4]whom all [5]blessings [1]flow'] },
            { part: 'chorus', text: ['[1]A[4]men, [5]a[1]men'] },
        ],
    },
];

async function main(): Promise<void> {
    const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-laude' });
    const auth = getAuth(app);
    const db = getFirestore(app);
    db.settings({ ignoreUndefinedProperties: true });

    try {
        await auth.createUser({ uid: TEST_UID, email: TEST_EMAIL, password: TEST_PASSWORD, displayName: 'E2E Tester' });
        console.log(`seed-e2e: created ${TEST_EMAIL}`);
    } catch (err) {
        const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
        if (code === 'auth/uid-already-exists' || code === 'auth/email-already-exists') {
            await auth.updateUser(TEST_UID, { email: TEST_EMAIL, password: TEST_PASSWORD });
            console.log(`seed-e2e: refreshed ${TEST_EMAIL}`);
        } else {
            throw err;
        }
    }

    const now = new Date();
    await db.collection('users').doc(TEST_UID).set({
        firebaseUid: TEST_UID,
        email: TEST_EMAIL,
        displayName: 'E2E Tester',
        photoURL: null,
        authProvider: 'email',
        roles: [{ role: 'user' }],
        churchSubscriptions: [],
        favoriteKey: 'G',
        defaultChordStyle: 'letters',
        favoriteSongs: [],
        createdAt: now,
        lastLoginAt: now,
    });

    for (const song of SONGS) {
        const counters = new Map<string, number>();
        const parts = song.lines.map((def, index) => {
            const n = (counters.get(def.part) ?? 0) + 1;
            counters.set(def.part, n);
            return {
                id: `${def.part === 'chorus' ? 'C' : 'V'}${n}`,
                type: def.part,
                index,
                lines: def.text.map((text) => ({ text })),
            };
        });
        await db.collection('songs').doc(song.id).set({
            id: song.id,
            title: song.title,
            canonical_title: song.title,
            author: 'E2E Fixture',
            defaultKey: song.key,
            default_key: song.key,
            language: 'en',
            tags: ['e2e'],
            verified: true,
            created_at: now.toISOString(),
            defaultArrangement: parts.map((p) => p.id),
            arrangements: [{ id: 'arr-default', name: 'Standard', order: parts.map((p) => p.id), isDefault: true }],
            parts,
            libraryType: 'official',
            visibility: 'public',
            ownerId: TEST_UID,
            createdAt: now,
            updatedAt: now,
            createdBy: TEST_UID,
        });
    }
    console.log(`seed-e2e: ${SONGS.length} songs seeded`);
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error('seed-e2e failed:', err);
        process.exit(1);
    },
);
