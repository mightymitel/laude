/**
 * GLOBAL mock seeder — fills the Firebase EMULATOR (never a real project)
 * with the global-domain demo content only: auth user, users doc, songs,
 * lyrics, translation links, setlists and the demo playlist.
 *
 * Personal-domain data (services, segments, performances, time-annotations,
 * audio) lives in the LaudStudio LOCAL store — see seed-local.ts. Sessions are
 * owned by the relay service, not seeded.
 *
 * Idempotent: deterministic document ids + plain set() overwrites.
 * Run from the workspace root:  npm run seed -w apps/laudstudio
 */
import { FIRESTORE_HOST, PROJECT_ID } from './env';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { renderChordPro } from '@laude/chords';
import { COLLECTIONS, type SongId, type SongLyrics } from '@laude/song-model';

import { buildChordPro, buildLrc, buildParts } from './build';
import { SEED_SONGS, getSeedSong, type SeedSongDef } from './content/songs';
import { SEED_SETLISTS, SEED_SETLIST_ITEMS, buildDemoPlaylist } from './content/setlists';
import type { LaudasistUserDoc } from './laudasist-types';

const DEMO_UID = 'demo-user';
const DEMO_EMAIL = 'demo@laude.local';
const DEMO_PASSWORD = 'parola-demo';
const NOW_ISO = '2026-07-07T09:00:00.000Z'; // fixed so reruns are byte-identical
const NOW = new Date(NOW_ISO);

// ---------------------------------------------------------------------------
// Emulator readiness + Firebase init
// ---------------------------------------------------------------------------

async function waitForEmulator(name: string, url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      // Any HTTP answer means the port is served; 501 etc. is fine.
      if (res.status < 600) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} emulator not reachable at ${url} after ${timeoutMs}ms (${lastError})`);
}

/** The suite's emulators come up one by one — wait for every one we write to. */
async function waitForEmulators(): Promise<void> {
  await waitForEmulator('Firestore', `http://${FIRESTORE_HOST}/`);
  await waitForEmulator('Auth', `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/`);
}

function errorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const counts = new Map<string, number>();

async function main(): Promise<void> {
  console.log(`Waiting for the emulator suite (firestore ${FIRESTORE_HOST}) …`);
  await waitForEmulators();

  const app = initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });

  const write = async (collection: string, id: string, data: object): Promise<void> => {
    await db.collection(collection).doc(id).set(data);
    counts.set(collection, (counts.get(collection) ?? 0) + 1);
  };

  // --- Auth user + Laudasist users doc --------------------------------------
  const auth = getAuth(app);
  try {
    await auth.createUser({
      uid: DEMO_UID,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      displayName: 'Demo Laude',
    });
    console.log(`Auth: created user ${DEMO_UID} (${DEMO_EMAIL})`);
  } catch (err) {
    const code = errorCode(err);
    if (code === 'auth/uid-already-exists' || code === 'auth/email-already-exists') {
      await auth.updateUser(DEMO_UID, {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        displayName: 'Demo Laude',
      });
      console.log(`Auth: user ${DEMO_UID} already existed — refreshed`);
    } else {
      throw err;
    }
  }

  const userDoc: LaudasistUserDoc = {
    firebaseUid: DEMO_UID,
    email: DEMO_EMAIL,
    displayName: 'Demo Laude',
    photoURL: null,
    authProvider: 'email',
    roles: [{ role: 'user' }],
    churchSubscriptions: [],
    favoriteKey: 'G',
    defaultChordStyle: 'letters',
    favoriteSongs: ['song-aproape-de-tine', 'song-river-of-grace'],
    createdAt: NOW,
    lastLoginAt: NOW,
  };
  await write('users', DEMO_UID, userDoc);

  // --- Songs (merged platform + Laudasist shape) + lyrics + links ------------
  const chordproBySong = new Map<SongId, string>();
  for (const song of SEED_SONGS) {
    const { parts, defaultArrangement, arrangements } = buildParts(song);
    await write(COLLECTIONS.songs, song.id, {
      // Platform contract (@laude/song-model Song)
      id: song.id,
      canonical_title: song.title,
      original_key: song.key,
      default_bpm: song.bpm,
      language: song.language,
      tags: song.tags,
      verified: song.verified,
      created_at: NOW_ISO,
      // Laudasist fields (laudasist/packages/shared Song)
      title: song.title,
      author: song.author,
      originalKey: song.key,
      defaultArrangement,
      arrangements,
      parts,
      libraryType: 'official',
      visibility: 'public',
      ownerId: DEMO_UID,
      ...(song.translationOf !== undefined ? { translationOf: song.translationOf } : {}),
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: DEMO_UID,
    });

    const chordpro = buildChordPro(song);
    chordproBySong.set(song.id, chordpro);
    const lyrics: SongLyrics = {
      song_id: song.id,
      lang: song.language,
      chordpro,
      verified: song.verified,
      ...(song.withLrc ? { lrc: buildLrc(song) } : {}),
    };
    await write(COLLECTIONS.song_lyrics, `${song.id}-${song.language}`, lyrics);

    if (song.translationOf) {
      await write(COLLECTIONS.song_links, `link-${song.id}--${song.translationOf}`, {
        song_id: song.id,
        related_song_id: song.translationOf,
        relation_type: 'translation',
      });
    }
  }

  // --- Setlists, setlist items, Laudasist playlist ---------------------------
  for (const setlist of SEED_SETLISTS) await write(COLLECTIONS.setlists, setlist.id, setlist);
  for (const item of SEED_SETLIST_ITEMS) await write(COLLECTIONS.setlist_items, item.id, item);
  await write('playlists', 'playlist-demo-favorite', buildDemoPlaylist(NOW_ISO));

  // --- ChordPro self-check (must parse via @laude/chords) ---------------------
  selfCheckChordPro(chordproBySong);

  printSummary();
}

// ---------------------------------------------------------------------------
// ChordPro self-check
// ---------------------------------------------------------------------------

function selfCheckChordPro(chordproBySong: Map<SongId, string>): void {
  for (const [songId, chordpro] of chordproBySong) {
    const def: SeedSongDef = getSeedSong(songId);
    const rendered = renderChordPro(chordpro);
    if (rendered.title !== def.title) {
      throw new Error(`Self-check failed for ${songId}: title "${rendered.title}" !== "${def.title}"`);
    }
    if (rendered.key !== def.key) {
      throw new Error(`Self-check failed for ${songId}: key "${rendered.key}" !== "${def.key}"`);
    }
    if (rendered.sections.length !== def.sections.length) {
      throw new Error(
        `Self-check failed for ${songId}: ${rendered.sections.length} sections rendered, expected ${def.sections.length}`,
      );
    }
    const chordCount = rendered.sections
      .flatMap((s) => s.lines)
      .flatMap((l) => l.items)
      .filter((item) => item.chord !== '').length;
    if (chordCount === 0) {
      throw new Error(`Self-check failed for ${songId}: no chords rendered from chordpro`);
    }
    // Nashville notation must render too (Laudasist displays it).
    const nashville = renderChordPro(chordpro, { notation: 'nashville' });
    if (nashville.sections.length !== def.sections.length) {
      throw new Error(`Self-check failed for ${songId}: nashville render lost sections`);
    }
  }
  console.log(`ChordPro self-check: ${chordproBySong.size}/${chordproBySong.size} songs parse and render (english + nashville) OK`);
}

function printSummary(): void {
  console.log('\nGlobal seed complete. Documents written per collection:');
  console.table(
    [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([collection, docs]) => ({ collection, docs })),
  );
  console.log(`Auth demo user: ${DEMO_UID} / ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
