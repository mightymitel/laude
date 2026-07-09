/**
 * Mint-or-link bridge (WP-103) — the ONLY cloud touch on the personal side:
 * join a local song to a global song ID, or create one.
 *
 *  - CANDIDATES: the shared server-side lyrics-search endpoint (DEC-69),
 *    same-language only (DEC-66), called with the standing sign-in. The
 *    matcher's job is the top five, not being right.
 *  - SUGGEST, HUMAN CONFIRMS (DEC-24): there is NO auto-link path. link()
 *    takes the id the human confirmed; mint() is the explicit alternative.
 *  - MINT: songs {default_key ← analysis_key, libraryType user} +
 *    song_lyrics {degrees copied VERBATIM, visibility private} — no
 *    conversion step (DEC-59). Only the WORK crosses (DEC-44).
 *  - LINK is READ-ONLY (DEC-57): sets global_song_id, pulls the global chart
 *    in as a snapshot + snapshot_parts; writes NOTHING to global. A local
 *    chart the editor touched is retained as derived_chordpro (DEC-61).
 *  - UNLINK: store.unlinkSong (no fork verb).
 *  - AUTO-ALIGNMENT runs after link/mint for every performance (optional to
 *    review — alignment unlocks DRIVING, not linking).
 *
 * Requires connectivity + the durable sign-in; everything else is offline.
 * Runs against the Firebase EMULATOR in dev (see ../env).
 */
import '../env';
import { renderChordPro } from '@laude/chords';
import type { Arrangement, PartType, SongPart } from '../laudasist-types';
import type { LocalStore, LocalSongRow } from '../store';
import { alignPerformance } from './align';
import { currentIdToken, requireUid } from './auth';
import { createUserDoc, getUserDoc, queryUserDocs } from './firestoreRest';
import { chartSnapshotParts, normalizeLyric } from './snapshot';

const API_URL = process.env.LAUDASIST_API_URL ?? 'http://localhost:3001';

export interface LinkResult {
  ok: boolean;
  song_id?: string;
  minted?: boolean;
  already?: boolean;
  error?: string;
}

export interface BridgeCandidate {
  song_id: string;
  title: string;
  author: string | null;
  snippet: string;
  score: number;
}

/**
 * The global chart for a song, read AS THE USER (WP-114). Direct doc read on
 * the `{songId}-{language}` convention first (works for your own private
 * songs); public-filtered query as the fallback — rules-checked queries must
 * be provably readable, so the fallback constrains visibility=='public'.
 */
export async function findGlobalChart(
  songId: string,
  language: string,
): Promise<string | null> {
  const direct = await getUserDoc(`song_lyrics/${songId}-${language}`);
  if (typeof direct?.chordpro === 'string' && direct.chordpro.trim()) {
    return direct.chordpro;
  }
  const rows = await queryUserDocs('song_lyrics', 'song_id', songId, 3);
  for (const row of rows) {
    if (typeof row.data.chordpro === 'string' && row.data.chordpro.trim()) {
      return row.data.chordpro;
    }
  }
  return null;
}

/** Best-effort: tell the api its lyrics index is stale (mint bypasses the
 * api's write routes — WP-114's related fix; a fresh mint must be searchable
 * immediately or duplicate mints happen). */
async function invalidateApiSearch(): Promise<void> {
  try {
    const token = await currentIdToken();
    await fetch(`${API_URL}/api/search/reindex`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.warn('link: search reindex ping failed (index heals via TTL)', err);
  }
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

/** The query the matcher sends: the chart's first non-empty lyric lines —
 * lyrics are the reliable key; titles are OCR'd slides (DEC-69). */
function matchQuery(song: LocalSongRow): string {
  const rendered = renderChordPro(song.chordpro);
  const lines = rendered.sections
    .flatMap((s) => s.lines)
    .map((l) => l.items.map((i) => i.lyrics).join('').trim())
    .filter((l) => normalizeLyric(l) !== '');
  return lines.slice(0, 2).join(' ') || song.title;
}

/** Top candidates for a human to confirm — NEVER auto-linked. */
export async function bridgeCandidates(
  store: LocalStore,
  localSongId: string,
): Promise<BridgeCandidate[]> {
  const song = store.getLocalSong(localSongId);
  if (!song) throw new Error(`unknown local song ${localSongId}`);
  const token = await currentIdToken();
  const params = new URLSearchParams({
    q: matchQuery(song),
    language: song.language, // same-language only in v1 (DEC-66)
    limit: '5',
  });
  const res = await fetch(`${API_URL}/api/search/lyrics?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`lyrics search failed: HTTP ${res.status}`);
  const body = (await res.json()) as { results: BridgeCandidate[] };
  return body.results;
}

/** After link/mint: snapshot + auto-align every performance of the song. */
function snapshotAndAlign(store: LocalStore, localSongId: string, chart: string): void {
  const snapshot = chartSnapshotParts(chart);
  const now = new Date().toISOString();
  const fresh = store.getLocalSong(localSongId);
  if (!fresh) return;
  store.upsertLocalSong({
    ...fresh,
    snapshot_parts: snapshot,
    snapshot_taken_at: now,
    updated_at: now,
  });
  for (const perf of store.listPerformances(localSongId)) {
    alignPerformance(store, perf.id, snapshot.parts);
  }
}

/** LINK to a human-confirmed global song. READ-ONLY on the global side. */
export async function linkToSong(
  store: LocalStore,
  localSongId: string,
  globalSongId: string,
): Promise<LinkResult> {
  const song = store.getLocalSong(localSongId);
  if (!song) return { ok: false, error: `unknown local song ${localSongId}` };
  if (song.global_song_id) return { ok: true, song_id: song.global_song_id, already: true };
  try {
    requireUid();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Read AS THE USER (WP-114): rules decide what this account may link to.
  const globalChart = await findGlobalChart(globalSongId, song.language);
  if (globalChart === null) {
    return { ok: false, error: `global song ${globalSongId} has no chart readable by this account` };
  }

  const now = new Date().toISOString();
  // DEC-61: a chart the editor touched survives as derived_chordpro (already
  // stored by the editor); an untouched derivation is discarded —
  // re-derivation stays possible, the raw inputs never leave the device.
  store.upsertLocalSong({
    ...song,
    chordpro: globalChart,
    chart_source: 'snapshot',
    updated_at: now,
  });
  store.linkSong(localSongId, globalSongId);
  snapshotAndAlign(store, localSongId, globalChart);
  console.log(`link: linked ${localSongId} → global ${globalSongId} (read-only)`);
  return { ok: true, song_id: globalSongId, minted: false };
}

/** MINT a new PRIVATE global song — the human chose "no match". */
export async function mintSong(store: LocalStore, localSongId: string): Promise<LinkResult> {
  const song = store.getLocalSong(localSongId);
  if (!song) return { ok: false, error: `unknown local song ${localSongId}` };
  if (song.global_song_id) return { ok: true, song_id: song.global_song_id, already: true };
  if (!song.chordpro.trim()) return { ok: false, error: 'song has no chart to publish' };

  let uid: string;
  try {
    uid = requireUid();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const now = new Date();
  const degreeChart = song.chordpro; // straight copy — degrees since extraction (DEC-59)
  const { parts, defaultArrangement, arrangements } = buildLaudasistParts(
    degreeChart,
    song.analysis_key,
  );
  // Writes go AS THE USER (WP-114): security rules bind them, and CREATE
  // fails with ALREADY_EXISTS rather than overwriting a doc that happens to
  // share the id — mint means create.
  try {
    await createUserDoc('songs', localSongId, {
      id: localSongId,
      canonical_title: song.title,
      default_key: song.analysis_key,
      language: song.language,
      tags: ['laudstudio'],
      verified: false,
      created_at: now.toISOString(),
      title: song.title,
      author: song.author ?? 'Extras automat (UNVERIFIED)',
      defaultKey: song.analysis_key,
      defaultArrangement,
      arrangements,
      parts,
      libraryType: 'user',
      ownerId: uid,
      visibility: 'private',
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    });
    await createUserDoc('song_lyrics', `${localSongId}-${song.language}`, {
      song_id: localSongId,
      lang: song.language,
      chordpro: degreeChart,
      visibility: 'private',
      verified: false,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  store.linkSong(localSongId, localSongId);
  snapshotAndAlign(store, localSongId, degreeChart);
  await invalidateApiSearch();
  console.log(`link: minted private global song ${localSongId} (as ${uid})`);
  return { ok: true, song_id: localSongId, minted: true };
}

/** UNLINK — local-only; no global rows are touched (DEC-68). */
export function unlinkLocalSong(store: LocalStore, localSongId: string): LinkResult {
  const song = store.getLocalSong(localSongId);
  if (!song) return { ok: false, error: `unknown local song ${localSongId}` };
  if (!song.global_song_id) return { ok: true, song_id: localSongId, already: true };
  store.unlinkSong(localSongId);
  console.log(`link: unlinked ${localSongId} (chart restored to editable)`);
  return { ok: true, song_id: localSongId };
}
