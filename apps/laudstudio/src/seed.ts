/**
 * LaudStudio MOCK seeder — stands in for the offline Python pipeline during the
 * wireframe PoC. Writes realistic fake songs / lyrics / services / performances
 * / time-annotations into the Firebase EMULATOR (never a real project).
 *
 * Idempotent: deterministic document ids + plain set() overwrites.
 * Run from the workspace root:  npm run seed -w apps/laudstudio
 */
import { FIRESTORE_HOST, PROJECT_ID, STORAGE_BUCKET } from './env';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { renderChordPro, renderChordSymbol, transposeAmount } from '@laude/chords';
import {
  ALL_STEMS,
  COLLECTIONS,
  storagePaths,
  type Performance,
  type PerformanceId,
  type Segment,
  type SongId,
  type SongLyrics,
} from '@laude/song-model';

import {
  buildBeatGrid,
  buildChordEvents,
  buildChordPro,
  buildLrc,
  buildParts,
  buildSections,
  chordProgression,
} from './build';
import { SEED_SONGS, getSeedSong, type SeedSongDef } from './content/songs';
import { SEED_SERVICES } from './content/services';
import { SEED_SETLISTS, SEED_SETLIST_ITEMS, buildDemoPlaylist, buildLiveSession } from './content/setlists';
import type { LaudasistUserDoc } from './laudasist-types';

const DEMO_UID = 'demo-user';
const DEMO_EMAIL = 'demo@laude.local';
const DEMO_PASSWORD = 'parola-demo';
const KEY_VARIANTS = [-2, -1, 0, 1, 2];
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
  await waitForEmulator('Storage', `${process.env.STORAGE_EMULATOR_HOST}/`);
}

function errorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Write helper with per-collection counters (for the summary table)
// ---------------------------------------------------------------------------

const counts = new Map<string, number>();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Waiting for the emulator suite (firestore ${FIRESTORE_HOST}) …`);
  await waitForEmulators();

  const app = initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
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

  // --- Services, segments, performances (derived from content/services) -----
  const preferredPerformanceBySong = new Map<SongId, PerformanceId>();
  const segments: Segment[] = [];
  const performances: Performance[] = [];
  const tier2Performances: Performance[] = [];

  for (const service of SEED_SERVICES) {
    await write(COLLECTIONS.services, service.id, {
      id: service.id,
      date: service.date,
      title: service.title,
      youtube_id: service.youtube_id,
    });

    let songSlot = 0;
    service.segments.forEach((segDef, i) => {
      const segmentId = `seg-${service.id}-${String(i + 1).padStart(2, '0')}`;
      segments.push({
        id: segmentId,
        service_id: service.id,
        type: segDef.type,
        start_s: segDef.start_s,
        end_s: segDef.end_s,
        ...(segDef.song_id !== undefined ? { song_id: segDef.song_id } : {}),
      });

      if (segDef.type !== 'song' || !segDef.song_id || !segDef.performance) return;
      songSlot += 1;
      const song = getSeedSong(segDef.song_id);
      const perfDef = segDef.performance;
      const performance: Performance = {
        id: `perf-${service.id.replace(/^svc-/, '')}-s${songSlot}`,
        song_id: song.id,
        service_id: service.id,
        youtube_id: service.youtube_id,
        start_s: segDef.start_s,
        end_s: segDef.end_s,
        key: perfDef.key ?? song.key,
        bpm: perfDef.bpm ?? song.bpm,
        verified: perfDef.verified,
        stems: perfDef.tier2 ? [...ALL_STEMS] : [],
        key_variants: perfDef.tier2 ? [...KEY_VARIANTS] : [],
      };
      performances.push(performance);
      if (perfDef.tier2) tier2Performances.push(performance);
      if (perfDef.promoted && !preferredPerformanceBySong.has(song.id)) {
        preferredPerformanceBySong.set(song.id, performance.id);
      }
    });
  }

  for (const segment of segments) await write(COLLECTIONS.segments, segment.id, segment);
  for (const performance of performances) {
    await write(COLLECTIONS.performances, performance.id, performance);
  }

  // --- Tier-2 annotations: sections, beatgrid, chords ------------------------
  for (const performance of tier2Performances) {
    const song = getSeedSong(performance.song_id);
    const durationS = performance.end_s - performance.start_s;
    // Annotation times are relative to the performance start (0-based).
    for (const section of buildSections(performance.id, durationS, performance.bpm)) {
      await write(COLLECTIONS.sections, section.id, section);
    }
    await write(
      COLLECTIONS.beatgrid,
      performance.id,
      buildBeatGrid(performance.id, durationS, performance.bpm),
    );
    const semitones = transposeAmount(song.key, performance.key);
    const progression = chordProgression(song).map((symbol) =>
      renderChordSymbol(symbol, semitones, 'english', { key: performance.key }),
    );
    await write(COLLECTIONS.chords, performance.id, {
      performance_id: performance.id,
      data: buildChordEvents(progression, durationS, performance.bpm),
      verified: performance.verified,
    });
  }

  // --- Songs (merged platform + Laudasist shape) + lyrics + links ------------
  const chordproBySong = new Map<SongId, string>();
  for (const song of SEED_SONGS) {
    const { parts, defaultArrangement, arrangements } = buildParts(song);
    const preferred = preferredPerformanceBySong.get(song.id);
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
      ...(preferred !== undefined ? { preferred_performance_id: preferred } : {}),
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

  // --- Setlists, setlist items, live session, Laudasist playlist -------------
  for (const setlist of SEED_SETLISTS) await write(COLLECTIONS.setlists, setlist.id, setlist);
  for (const item of SEED_SETLIST_ITEMS) await write(COLLECTIONS.setlist_items, item.id, item);
  await write(COLLECTIONS.sessions, 'main', buildLiveSession(NOW_ISO));
  await write('playlists', 'playlist-demo-favorite', buildDemoPlaylist(NOW_ISO));

  // --- Storage placeholders for Tier-2 performances ---------------------------
  const storageResult = await uploadStoragePlaceholders(tier2Performances);

  // --- ChordPro self-check (must parse via @laude/chords) ---------------------
  selfCheckChordPro(chordproBySong);

  printSummary(storageResult);
}

// ---------------------------------------------------------------------------
// Storage placeholders
// ---------------------------------------------------------------------------

interface StorageResult {
  uploaded: number;
  failed: number;
}

async function uploadStoragePlaceholders(tier2Performances: Performance[]): Promise<StorageResult> {
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  const result: StorageResult = { uploaded: 0, failed: 0 };

  for (const performance of tier2Performances) {
    const paths: string[] = [storagePaths.mixdown(performance.song_id, performance.id)];
    for (const stem of ALL_STEMS) {
      paths.push(storagePaths.stem(performance.song_id, performance.id, stem));
      for (const semitones of KEY_VARIANTS) {
        if (semitones === 0) continue; // 0 = the original stem, no variant file
        paths.push(storagePaths.keyVariant(performance.song_id, performance.id, stem, semitones));
      }
    }
    for (const path of paths) {
      try {
        await bucket.file(path).save(`UNVERIFIED mock placeholder — ${path}\n`, {
          resumable: false,
          contentType: 'text/plain',
        });
        result.uploaded += 1;
      } catch (err) {
        result.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Storage upload failed for ${path}: ${message}`);
      }
    }
  }
  return result;
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

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(storage: StorageResult): void {
  console.log('\nSeed complete. Documents written per collection:');
  console.table(
    [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([collection, docs]) => ({ collection, docs })),
  );
  console.log(`Storage placeholders: ${storage.uploaded} uploaded, ${storage.failed} failed`);
  console.log(`Auth demo user: ${DEMO_UID} / ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
