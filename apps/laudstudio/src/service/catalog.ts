/**
 * Read side of the local service: the catalog + performance detail LauDJ
 * plays from, and audio file streaming out of the data dir.
 */
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import { ALL_STEMS, type StemName } from '@laude/song-model';
import type { AudioKind, LocalStore } from '../store';
import { DATA_DIR } from '../store/paths';

const AUDIO_TYPES: Record<string, string> = {
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

export function catalogBody(store: LocalStore): unknown {
  return { songs: store.listCatalog() };
}

export function performanceBody(store: LocalStore, performanceId: string): unknown | null {
  return store.getPerformanceDetail(performanceId);
}

function isStemName(v: string): v is StemName {
  return (ALL_STEMS as string[]).includes(v);
}

/**
 * Map an /audio/... URL to a registered file. Returns null for unknown routes
 * or files missing on disk. Shape:
 *   /audio/{perfId}/stem/{stem}
 *   /audio/{perfId}/variant/{stem}/{semitones}
 *   /audio/{perfId}/mixdown
 */
export function resolveAudio(store: LocalStore, urlPath: string): string | null {
  const parts = urlPath.split('/').filter(Boolean); // ['audio', perfId, kind, ...]
  if (parts[0] !== 'audio' || parts.length < 3) return null;
  const perfId = decodeURIComponent(parts[1]);

  let kind: AudioKind;
  let stem = '';
  let semitones = 0;
  if (parts[2] === 'stem' && parts.length === 4 && isStemName(parts[3])) {
    kind = 'stem';
    stem = parts[3];
  } else if (parts[2] === 'variant' && parts.length === 5 && isStemName(parts[3])) {
    kind = 'variant';
    stem = parts[3];
    semitones = Number(parts[4]);
    if (!Number.isInteger(semitones)) return null;
  } else if (parts[2] === 'mixdown' && parts.length === 3) {
    kind = 'mixdown';
  } else {
    return null;
  }

  const rel = store.getAudioPath(perfId, kind, stem, semitones);
  if (!rel) return null;
  const abs = join(DATA_DIR, rel);
  return existsSync(abs) ? abs : null;
}

export function streamAudio(res: ServerResponse, absPath: string): void {
  const ext = absPath.slice(absPath.lastIndexOf('.') + 1).toLowerCase();
  res.writeHead(200, {
    'Content-Type': AUDIO_TYPES[ext] ?? 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  createReadStream(absPath).pipe(res);
}
