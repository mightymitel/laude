/**
 * LaudStudio local data layout (personal domain — never in the cloud):
 *   data/laudstudio.db                          SQLite store
 *   data/audio/{performance_id}/{stem}.ogg     stems
 *   data/audio/{performance_id}/variants/{stem}{±n}.ogg
 *   data/audio/{performance_id}/mixdown.ogg
 * Override the root with LAUDSTUDIO_DATA_DIR.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StemName } from '@laude/song-model';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const DATA_DIR = resolve(process.env.LAUDSTUDIO_DATA_DIR ?? join(APP_DIR, 'data'));
export const DB_PATH = join(DATA_DIR, 'laudstudio.db');

export function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const audioPaths = {
  dir: (performanceId: string) => join(DATA_DIR, 'audio', performanceId),
  stem: (performanceId: string, stem: StemName, ext = 'ogg') =>
    join(DATA_DIR, 'audio', performanceId, `${stem}.${ext}`),
  keyVariant: (performanceId: string, stem: StemName, semitones: number, ext = 'ogg') =>
    join(
      DATA_DIR,
      'audio',
      performanceId,
      'variants',
      `${stem}${semitones > 0 ? '+' : ''}${semitones}.${ext}`,
    ),
  mixdown: (performanceId: string, ext = 'ogg') =>
    join(DATA_DIR, 'audio', performanceId, `mixdown.${ext}`),
};
