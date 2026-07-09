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
import { renderChordPro } from '@laude/chords';
import { COLLECTIONS } from '@laude/song-model';
import { PROJECT_ID } from '../env';
import type { Arrangement, PartType, SongPart } from '../laudasist-types';
import type { LocalStore } from '../store';
import { requireUid } from './auth';

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
  if (!song.chordpro.trim()) return { ok: false, error: 'song has no chart to publish' };

  // The standing sign-in (WP-108) stamps ownership; linking never prompts.
  let uid: string;
  try {
    uid = requireUid();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

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
  // (DEC-44/45): the song-level DEGREE chart, copied verbatim (DEC-59 —
  // degrees were computed at extraction; mint has no conversion step).
  // analysis_key seeds default_key once; independent thereafter (DEC-60).
  // LRC/grid/sections/stems stay local to LaudStudio.
  const now = new Date();
  const degreeChart = song.chordpro;
  const { parts, defaultArrangement, arrangements } = buildLaudasistParts(degreeChart, song.analysis_key);
  await firestore.collection(COLLECTIONS.songs).doc(localSongId).set({
    id: localSongId,
    canonical_title: song.title,
    default_key: song.analysis_key,
    language: song.language,
    tags: ['laudstudio'],
    verified: false,
    created_at: now.toISOString(),
    title: song.title,
    author: 'Extras automat (UNVERIFIED)',
    defaultKey: song.analysis_key,
    defaultArrangement,
    arrangements,
    parts,
    libraryType: 'user',
    ownerId: uid,
    visibility: 'private',
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
    createdBy: uid,
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
