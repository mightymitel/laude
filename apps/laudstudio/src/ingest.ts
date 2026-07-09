/**
 * Ingest: pipeline manifest.json -> Firebase emulator (Firestore + Storage),
 * then validate the extraction against a reference chart (melodia.ro) via
 * Laudasist's own import scraper API.
 *
 *   npm run ingest -w apps/laudstudio -- --work ../../.work/SG0m_hTsMu4 \
 *     --reference https://staging.melodia.ro/cantari/Isus-e-Rege
 *
 * Everything OCR/audio-derived is written verified:false (UNVERIFIED).
 */
import './env';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  ALL_STEMS,
  COLLECTIONS,
  storagePaths,
  type LrcLine,
  type StemName,
} from '@laude/song-model';
import { renderChordPro } from '@laude/chords';
import { PROJECT_ID, STORAGE_BUCKET } from './env';
import type { Arrangement, PartType, SongPart } from './laudasist-types';
import { validateAgainstReference } from './validate';

interface Manifest {
  youtube_id: string;
  source_url: string;
  title: string;
  duration_s: number;
  language: 'ro' | 'en';
  key: string;
  bpm: number;
  chordpro: string;
  lrc: LrcLine[];
  sections: { label: string; start_s: number; end_s: number; start_bar: number; end_bar: number }[];
  chord_events: { start_s: number; chord: string }[];
  beats: number[];
  downbeat_indices: number[];
  files: { stems: Record<string, string>; variants: Record<string, string>; mixdown: string };
}

const PITCHED_STEMS: StemName[] = ['vocals', 'bass', 'other'];
const VARIANTS = [-2, -1, 1, 2];
const DEMO_UID = 'demo-user';

function parseArgs(): { work: string; reference: string | null } {
  const args = process.argv.slice(2);
  let work: string | null = null;
  let reference: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--work') work = args[i + 1];
    if (args[i] === '--reference') reference = args[i + 1];
  }
  if (!work) throw new Error('--work <dir with manifest.json> is required');
  return { work: resolve(work), reference };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Rebuild Laudasist parts (Nashville bracket lines) from canonical ChordPro. */
function buildLaudasistParts(chordpro: string, key: string): {
  parts: SongPart[];
  defaultArrangement: string[];
  arrangements: Arrangement[];
} {
  const rendered = renderChordPro(chordpro, { notation: 'nashville', key });
  const counters = new Map<PartType, number>();
  const parts: SongPart[] = rendered.sections.map((section, index) => {
    const type: PartType = section.type === 'chorus' ? 'chorus' : 'verse';
    const n = (counters.get(type) ?? 0) + 1;
    counters.set(type, n);
    return {
      id: `${type === 'chorus' ? 'C' : 'V'}${n}`,
      type,
      index,
      lines: section.lines.map((line) => ({
        text: line.items
          .map((item) => (item.chord ? `[${item.chord}]${item.lyrics}` : item.lyrics))
          .join(''),
      })),
    };
  });
  const order = parts.map((p) => p.id);
  const arrangements: Arrangement[] = [{ id: 'arr-default', name: 'Standard', order, isDefault: true }];
  return { parts, defaultArrangement: order, arrangements };
}

async function main(): Promise<void> {
  const { work, reference } = parseArgs();
  const manifest: Manifest = JSON.parse(readFileSync(join(work, 'manifest.json'), 'utf-8'));

  const app = initializeApp({ projectId: PROJECT_ID, storageBucket: STORAGE_BUCKET });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  const bucket = getStorage(app).bucket();

  const songId = `song-${slugify(manifest.title)}`;
  const perfId = `perf-${manifest.youtube_id}`;
  const serviceId = `svc-${manifest.youtube_id}`;
  const now = new Date();

  // ---- Storage uploads --------------------------------------------------
  let uploaded = 0;
  async function upload(local: string, dest: string): Promise<void> {
    await bucket.upload(join(work, local), { destination: dest, contentType: 'audio/ogg' });
    uploaded += 1;
  }
  for (const stem of ALL_STEMS) {
    await upload(manifest.files.stems[stem], storagePaths.stem(songId, perfId, stem));
  }
  for (const stem of PITCHED_STEMS) {
    for (const st of VARIANTS) {
      const localKey = `${stem}${st > 0 ? '+' : ''}${st}`;
      await upload(manifest.files.variants[localKey], storagePaths.keyVariant(songId, perfId, stem, st));
    }
  }
  await upload(manifest.files.mixdown, storagePaths.mixdown(songId, perfId, 'ogg'));
  console.log(`storage: ${uploaded} files uploaded`);

  // ---- Firestore --------------------------------------------------------
  const { parts, defaultArrangement, arrangements } = buildLaudasistParts(
    manifest.chordpro,
    manifest.key,
  );

  await db.collection(COLLECTIONS.songs).doc(songId).set({
    // platform contract
    id: songId,
    canonical_title: manifest.title,
    original_key: manifest.key,
    default_bpm: manifest.bpm,
    language: manifest.language,
    tags: ['laudstudio'],
    preferred_performance_id: perfId,
    verified: false,
    created_at: now.toISOString(),
    // Laudasist model (merged doc)
    title: manifest.title,
    author: 'Extras automat (UNVERIFIED)',
    originalKey: manifest.key,
    defaultArrangement,
    arrangements,
    parts,
    libraryType: 'official',
    ownerId: DEMO_UID,
    visibility: 'public',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
    createdBy: DEMO_UID,
  });

  await db.collection(COLLECTIONS.song_lyrics).doc(`${songId}-${manifest.language}`).set({
    song_id: songId,
    lang: manifest.language,
    chordpro: manifest.chordpro,
    lrc: manifest.lrc,
    verified: false,
  });

  await db.collection(COLLECTIONS.services).doc(serviceId).set({
    id: serviceId,
    date: now.toISOString().slice(0, 10),
    title: `Sursă YouTube — ${manifest.title}`,
    youtube_id: manifest.youtube_id,
  });
  await db.collection(COLLECTIONS.segments).doc(`${serviceId}-song-1`).set({
    id: `${serviceId}-song-1`,
    service_id: serviceId,
    type: 'song',
    start_s: 0,
    end_s: manifest.duration_s,
    song_id: songId,
  });

  await db.collection(COLLECTIONS.performances).doc(perfId).set({
    id: perfId,
    song_id: songId,
    service_id: serviceId,
    youtube_id: manifest.youtube_id,
    start_s: 0,
    end_s: manifest.duration_s,
    key: manifest.key,
    bpm: manifest.bpm,
    verified: false,
    stems: ALL_STEMS,
    key_variants: [-2, -1, 0, 1, 2],
  });

  for (const [i, section] of manifest.sections.entries()) {
    await db.collection(COLLECTIONS.sections).doc(`${perfId}-s${i}`).set({
      id: `${perfId}-s${i}`,
      performance_id: perfId,
      label: section.label,
      start_s: section.start_s,
      end_s: section.end_s,
      start_bar: section.start_bar,
      end_bar: section.end_bar,
    });
  }

  await db.collection(COLLECTIONS.beatgrid).doc(perfId).set({
    performance_id: perfId,
    bpm: manifest.bpm,
    beats: manifest.beats,
    downbeats: manifest.downbeat_indices,
  });

  await db.collection(COLLECTIONS.chords).doc(perfId).set({
    performance_id: perfId,
    data: manifest.chord_events,
    verified: false,
  });

  console.log(`firestore: song ${songId}, performance ${perfId}, ${manifest.sections.length} sections`);

  // ---- Validation against the reference chart ---------------------------
  if (reference) {
    await validateAgainstReference(manifest, reference, work);
  } else {
    console.log('validation: skipped (no --reference)');
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('Ingest failed:', err);
    process.exit(1);
  },
);
