// UNVERIFIED mock content — generated for the wireframe PoC.

import type { Setlist, SetlistItem } from '@laude/song-model';
import type { PlaylistDoc } from '../laudasist-types';

export const SEED_SETLISTS: Setlist[] = [
  {
    id: 'setlist-duminica-seara',
    title: 'Duminică seara — grup de casă',
    date: '2026-07-12',
    song_ids: [
      'song-aproape-de-tine',
      'song-rau-de-har',
      'song-vrednic-e-numele-tau',
      'song-cantare-in-noapte',
    ],
  },
  {
    id: 'setlist-youth-night',
    title: 'Youth night (bilingual)',
    date: '2026-07-17',
    song_ids: [
      'song-we-lift-you-high',
      'song-my-heart-sings',
      'song-inima-mea-canta',
      'song-river-of-grace',
      'song-close-to-you',
    ],
  },
];

export const SEED_SETLIST_ITEMS: SetlistItem[] = [
  { id: 'sli-duminica-seara-1', setlist_id: 'setlist-duminica-seara', song_id: 'song-aproape-de-tine', order: 1 },
  { id: 'sli-duminica-seara-2', setlist_id: 'setlist-duminica-seara', song_id: 'song-rau-de-har', order: 2, key: 'C', notes: 'Mai jos pentru grup mixt' },
  { id: 'sli-duminica-seara-3', setlist_id: 'setlist-duminica-seara', song_id: 'song-vrednic-e-numele-tau', order: 3 },
  { id: 'sli-duminica-seara-4', setlist_id: 'setlist-duminica-seara', song_id: 'song-cantare-in-noapte', order: 4, notes: 'Încheiere liniștită' },
  { id: 'sli-youth-night-1', setlist_id: 'setlist-youth-night', song_id: 'song-we-lift-you-high', order: 1 },
  { id: 'sli-youth-night-2', setlist_id: 'setlist-youth-night', song_id: 'song-my-heart-sings', order: 2, key: 'D' },
  { id: 'sli-youth-night-3', setlist_id: 'setlist-youth-night', song_id: 'song-inima-mea-canta', order: 3, key: 'D' },
  { id: 'sli-youth-night-4', setlist_id: 'setlist-youth-night', song_id: 'song-river-of-grace', order: 4 },
  { id: 'sli-youth-night-5', setlist_id: 'setlist-youth-night', song_id: 'song-close-to-you', order: 5, notes: 'Verse 1 in Romanian too' },
];

export function buildDemoPlaylist(nowIso: string): PlaylistDoc {
  return {
    ownerId: 'demo-user',
    name: 'Favorite grup de casă',
    description: 'UNVERIFIED mock playlist — seeded for the wireframe PoC.',
    items: [
      { id: 'pli-1', songId: 'song-aproape-de-tine', order: 1 },
      { id: 'pli-2', songId: 'song-rau-de-har', key: 'C', order: 2 },
      { id: 'pli-3', songId: 'song-close-to-you', order: 3 },
      { id: 'pli-4', songId: 'song-peste-ape', order: 4 },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
