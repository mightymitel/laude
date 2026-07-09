// UNVERIFIED mock content — generated for the wireframe PoC.
// Fake recorded services (YouTube ids invented) with Tier-1 segments;
// performances are derived from the song segments in seed.ts.

import type { SegmentType } from '@laude/song-model';
import type { Key } from '../laudasist-types';

export interface SeedPerformanceDef {
  /** Tier-2 done: sections + beatgrid + chords + stems + key variants + storage placeholders. */
  tier2: boolean;
  /** Promote as its song's preferred_performance_id. */
  promoted?: boolean;
  verified: boolean;
  /** Performed key; defaults to the song's original key. */
  key?: Key;
  /** Performed tempo; defaults to the song's default BPM. */
  bpm?: number;
}

export interface SeedSegmentDef {
  type: SegmentType;
  start_s: number;
  end_s: number;
  song_id?: string;
  performance?: SeedPerformanceDef;
}

export interface SeedServiceDef {
  id: string;
  title: string;
  date: string; // ISO date
  youtube_id: string;
  segments: SeedSegmentDef[];
}

export const SEED_SERVICES: SeedServiceDef[] = [
  {
    id: 'svc-2026-05-10',
    title: 'Serviciu duminică 10 mai 2026',
    date: '2026-05-10',
    youtube_id: 'mockYT0510aa',
    segments: [
      {
        type: 'song',
        start_s: 45,
        end_s: 345,
        song_id: 'song-aproape-de-tine',
        performance: { tier2: true, promoted: true, verified: true },
      },
      {
        type: 'song',
        start_s: 345,
        end_s: 630,
        song_id: 'song-rau-de-har',
        performance: { tier2: true, promoted: true, verified: true },
      },
      { type: 'indemnuri', start_s: 630, end_s: 900 },
      {
        type: 'song',
        start_s: 900,
        end_s: 1180,
        song_id: 'song-lumina-diminetii',
        performance: { tier2: true, promoted: true, verified: false },
      },
      { type: 'announcement', start_s: 1180, end_s: 1320 },
      { type: 'preaching', start_s: 1320, end_s: 3600 },
    ],
  },
  {
    id: 'svc-2026-05-17',
    title: 'Serviciu duminică 17 mai 2026',
    date: '2026-05-17',
    youtube_id: 'mockYT0517bb',
    segments: [
      {
        type: 'song',
        start_s: 50,
        end_s: 330,
        song_id: 'song-inima-mea-canta',
        performance: { tier2: true, promoted: true, verified: true },
      },
      {
        type: 'song',
        start_s: 330,
        end_s: 620,
        song_id: 'song-close-to-you',
        performance: { tier2: true, promoted: true, verified: true },
      },
      { type: 'indemnuri', start_s: 620, end_s: 860 },
      {
        type: 'song',
        start_s: 860,
        end_s: 1150,
        song_id: 'song-peste-ape',
        performance: { tier2: false, verified: false },
      },
      {
        type: 'song',
        start_s: 1150,
        end_s: 1420,
        song_id: 'song-aproape-de-tine',
        // Same song performed again, two semitones lower this time.
        performance: { tier2: false, verified: false, key: 'F' },
      },
      { type: 'preaching', start_s: 1420, end_s: 3500 },
    ],
  },
  {
    id: 'svc-2026-05-24',
    title: 'Serviciu duminică 24 mai 2026',
    date: '2026-05-24',
    youtube_id: 'mockYT0524cc',
    segments: [
      {
        type: 'song',
        start_s: 40,
        end_s: 320,
        song_id: 'song-river-of-grace',
        performance: { tier2: true, promoted: true, verified: true },
      },
      {
        type: 'song',
        start_s: 320,
        end_s: 610,
        song_id: 'song-morning-light',
        performance: { tier2: true, promoted: true, verified: false },
      },
      { type: 'announcement', start_s: 610, end_s: 730 },
      {
        type: 'song',
        start_s: 730,
        end_s: 1010,
        song_id: 'song-endless-mercy',
        performance: { tier2: false, verified: false, bpm: 80 },
      },
      { type: 'indemnuri', start_s: 1010, end_s: 1200 },
      {
        type: 'song',
        start_s: 1200,
        end_s: 1500,
        song_id: 'song-we-lift-you-high',
        performance: { tier2: false, verified: true },
      },
      { type: 'preaching', start_s: 1500, end_s: 3550 },
    ],
  },
];
