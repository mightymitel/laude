/**
 * Mint-or-link bridge — STUB (full match UX gets its own specced session).
 * The ONLY place the personal domain touches the cloud: a deliberate
 * "link/upload" of a local song to the global Laudasist library.
 *
 *  - link: naive normalized-title match against existing global songs
 *    (STUB for the fuzzy-match + human-confirm flow);
 *  - mint: otherwise create a PRIVATE global song + song_lyrics from the
 *    preferred performance's chart, then store the global id locally.
 *
 * Runs against the Firebase EMULATOR in dev (see ../env).
 */
import '../env';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { convertChordPro, renderChordPro } from '@laude/chords';
import { COLLECTIONS } from '@laude/song-model';
import { PROJECT_ID } from '../env';
import type { Arrangement, PartType, SongPart } from '../laudasist-types';
import type { LocalStore } from '../store';

const DEMO_UID = 'demo-user';

export interface LinkResult {
  ok: boolean;
  song_id?: string;
  minted?: boolean;
  already?: boolean;
  error?: string;
}

function db(): Firestore {
  const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
  const firestore = getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

export async function linkOrMint(store: LocalStore, localSongId: string): Promise<LinkResult> {
  const song = store.getLocalSong(localSongId);
  if (!song) return { ok: false, error: `unknown local song ${localSongId}` };
  if (song.global_song_id) return { ok: true, song_id: song.global_song_id, already: true };

  const perf = song.preferred_performance_id
    ? store.getPerformance(song.preferred_performance_id)
    : null;
  if (!perf) return { ok: false, error: 'song has no performance to publish from' };

  const firestore = db();

  // STUB match: normalized-title equality (the real bridge fuzzy-matches and
  // asks the human to confirm).
  const wanted = normalizeTitle(song.title);
  const existing = await firestore.collection(COLLECTIONS.songs).get();
  const match = existing.docs.find((d) => {
    const title = d.get('canonical_title');
    return typeof title === 'string' && normalizeTitle(title) === wanted;
  });
  if (match) {
    store.linkSong(localSongId, match.id);
    console.log(`link: matched existing global song ${match.id}`);
    return { ok: true, song_id: match.id, minted: false };
  }

  // Mint a PRIVATE global song owned by the demo user. Only the WORK crosses
  // (DEC-44/45): lyrics + chords as Nashville degrees with the detected key as
  // reference. LRC/grid/sections/stems stay local to LaudStudio.
  const now = new Date();
  const degreeChart = convertChordPro(perf.chordpro, { toNotation: 'nashville', key: perf.key });
  const { parts, defaultArrangement, arrangements } = buildLaudasistParts(degreeChart, perf.key);
  await firestore.collection(COLLECTIONS.songs).doc(localSongId).set({
    id: localSongId,
    canonical_title: song.title,
    default_key: song.original_key,
    language: song.language,
    tags: ['laudstudio'],
    verified: false,
    created_at: now.toISOString(),
    title: song.title,
    author: 'Extras automat (UNVERIFIED)',
    defaultKey: song.original_key,
    defaultArrangement,
    arrangements,
    parts,
    libraryType: 'user',
    ownerId: DEMO_UID,
    visibility: 'private',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
    createdBy: DEMO_UID,
  });
  await firestore
    .collection(COLLECTIONS.song_lyrics)
    .doc(`${localSongId}-${song.language}`)
    .set({
      song_id: localSongId,
      lang: song.language,
      chordpro: degreeChart,
      visibility: 'private',
      verified: false,
    });

  store.linkSong(localSongId, localSongId);
  console.log(`link: minted private global song ${localSongId}`);
  return { ok: true, song_id: localSongId, minted: true };
}
