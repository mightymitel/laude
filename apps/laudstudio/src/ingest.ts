/**
 * Ingest: pipeline manifest.json -> the LOCAL LaudStudio store (SQLite +
 * audio files under the data dir). Extraction NEVER touches the cloud —
 * pushing a song to the global Laudasist library is a separate, deliberate
 * step (the mint-or-link bridge, src/service/link.ts).
 *
 *   npm run ingest -w apps/laudstudio -- --work ../../.work/SG0m_hTsMu4 \
 *     --reference https://staging.melodia.ro/cantari/Isus-e-Rege
 *
 * Everything OCR/audio-derived is written verified:false (UNVERIFIED).
 */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ALL_STEMS, type LrcLine, type StemName } from '@laude/song-model';
import { LocalStore } from './store';
import { audioPaths } from './store/paths';
import { validateAgainstReference } from './validate';

export interface Manifest {
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

/** Copy one work-dir audio file into the data dir and register it. */
function importAudio(
  store: LocalStore,
  work: string,
  local: string,
  dest: string,
  perfId: string,
  kind: 'stem' | 'variant' | 'mixdown',
  stem = '',
  semitones = 0,
): void {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(work, local), dest);
  store.registerAudio(perfId, kind, dest, stem, semitones);
}

export function ingestManifest(store: LocalStore, work: string, manifest: Manifest): {
  localSongId: string;
  performanceId: string;
} {
  const localSongId = `song-${slugify(manifest.title)}`;
  const perfId = `perf-${manifest.youtube_id}`;
  const serviceId = `svc-${manifest.youtube_id}`;
  const nowIso = new Date().toISOString();

  store.upsertLocalSong({
    id: localSongId,
    global_song_id: store.getLocalSong(localSongId)?.global_song_id ?? null,
    title: manifest.title,
    language: manifest.language,
    original_key: manifest.key,
    default_bpm: manifest.bpm,
    preferred_performance_id: perfId,
    verified: false,
    created_at: nowIso,
  });

  store.upsertService({
    id: serviceId,
    date: nowIso.slice(0, 10),
    title: `Sursă YouTube — ${manifest.title}`,
    youtube_id: manifest.youtube_id,
  });
  store.replaceSegments(serviceId, [
    {
      id: `${serviceId}-song-1`,
      service_id: serviceId,
      type: 'song',
      start_s: 0,
      end_s: manifest.duration_s,
      local_song_id: localSongId,
    },
  ]);

  store.upsertPerformance({
    id: perfId,
    local_song_id: localSongId,
    service_id: serviceId,
    youtube_id: manifest.youtube_id,
    start_s: 0,
    end_s: manifest.duration_s,
    key: manifest.key,
    bpm: manifest.bpm,
    chordpro: manifest.chordpro,
    lrc: manifest.lrc,
    verified: false,
    created_at: nowIso,
  });
  store.replaceSections(perfId, manifest.sections);
  store.setBeatgrid(perfId, manifest.bpm, manifest.beats, manifest.downbeat_indices);
  store.setChords(
    perfId,
    manifest.chord_events.map((e) => ({ start_s: e.start_s, chord: e.chord })),
    false,
  );

  // ---- audio into the data dir --------------------------------------------
  let copied = 0;
  for (const stem of ALL_STEMS) {
    importAudio(store, work, manifest.files.stems[stem], audioPaths.stem(perfId, stem), perfId, 'stem', stem);
    copied += 1;
  }
  for (const stem of PITCHED_STEMS) {
    for (const st of VARIANTS) {
      const localKey = `${stem}${st > 0 ? '+' : ''}${st}`;
      importAudio(
        store,
        work,
        manifest.files.variants[localKey],
        audioPaths.keyVariant(perfId, stem, st),
        perfId,
        'variant',
        stem,
        st,
      );
      copied += 1;
    }
  }
  importAudio(store, work, manifest.files.mixdown, audioPaths.mixdown(perfId), perfId, 'mixdown');
  copied += 1;

  console.log(`local audio: ${copied} files imported into the data dir`);
  console.log(
    `local store: song ${localSongId}, performance ${perfId}, ${manifest.sections.length} sections`,
  );
  return { localSongId, performanceId: perfId };
}

async function main(): Promise<void> {
  const { work, reference } = parseArgs();
  const manifest: Manifest = JSON.parse(readFileSync(join(work, 'manifest.json'), 'utf-8'));
  const store = new LocalStore();
  try {
    ingestManifest(store, work, manifest);
  } finally {
    store.close();
  }

  if (reference) {
    await validateAgainstReference(manifest, reference, work);
  } else {
    console.log('validation: skipped (no --reference)');
  }
}

// Run only as a CLI (the service imports ingestManifest directly).
if (process.argv[1]?.endsWith('ingest.ts')) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error('Ingest failed:', err);
      process.exit(1);
    },
  );
}
