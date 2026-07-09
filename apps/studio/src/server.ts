/**
 * LaudStudio local service — the personal-domain HTTP surface on one port:
 *   POST /extract { youtube_url, reference_url? }      -> 202 { id }
 *   GET  /jobs                                         -> extraction job list
 *   GET  /catalog                                      -> playable songs (LauDJ)
 *   GET  /songs/:localSongId                           -> work-level detail (the chart)
 *   GET  /performances/:id                             -> grid/chord events/sections/LRC
 *   GET  /audio/:perfId/(stem/:stem|variant/:stem/:n|mixdown) -> audio files
 *   GET  /bridge/candidates/:localSongId               -> match candidates (human confirms)
 *   POST /link/:localSongId { song_id }                -> link to a confirmed global song
 *   POST /mint/:localSongId                            -> mint a new private global song
 *   POST /unlink/:localSongId                          -> drop the link (chart re-editable)
 *   PUT  /songs/:id/chart { chordpro }                 -> edit the chart (ownership lock)
 *   POST /songs/:id/rekey { key }                      -> rotate degrees (analysis key fix)
 *   GET  /performances/:id/map                         -> mapping rows (review states)
 *   POST /performances/:id/map { section_id, ... }     -> human review of one row
 *   POST /performances/:id/edit { op }                 -> interpretation edit op
 *   GET  /health
 * Node stdlib only for HTTP; state lives in the SQLite store (src/store).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { enqueueJob, listJobs, YOUTUBE_URL } from './service/jobs';
import { catalogBody, performanceBody, resolveAudio, streamAudio } from './service/catalog';
import { authState, signIn, signOut } from './service/auth';
import { applyEdit, rekeySong, reviewMapRow, setChart, chartAccess, type EditOperation, type MapReviewAction } from './editor';
import { bridgeCandidates, linkToSong, mintSong, unlinkLocalSong } from './service/link';
import { LocalStore } from './store';

const PORT = Number(process.env.LAUDSTUDIO_PORT ?? 3002);
const store = new LocalStore();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
  });
}

async function handleSignIn(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    json(res, 400, { error: 'invalid JSON' });
    return;
  }
  const record =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const email = typeof record.email === 'string' ? record.email.trim() : '';
  const password = typeof record.password === 'string' ? record.password : '';
  if (!email || !password) {
    json(res, 400, { error: 'email and password are required' });
    return;
  }
  try {
    json(res, 200, await signIn(email, password));
  } catch (err) {
    json(res, 401, { error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleExtract(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch {
    json(res, 400, { error: 'invalid JSON' });
    return;
  }
  const record =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  const youtubeUrl = typeof record.youtube_url === 'string' ? record.youtube_url.trim() : '';
  const referenceUrl = typeof record.reference_url === 'string' ? record.reference_url.trim() : '';
  if (!YOUTUBE_URL.test(youtubeUrl)) {
    json(res, 400, { error: 'youtube_url must be a https://www.youtube.com/watch?v=… or youtu.be link' });
    return;
  }
  const job = enqueueJob(youtubeUrl, referenceUrl || null);
  json(res, 202, { id: job.id });
}

const server = createServer((req, res) => {
  const method = req.method ?? 'GET';
  const path = (req.url ?? '/').split('?')[0];

  if (method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }
  if (method === 'GET' && path === '/health') {
    json(res, 200, { ok: true });
    return;
  }
  // Durable sign-in (WP-108): the standing account link/mint runs under.
  if (method === 'GET' && path === '/auth') {
    json(res, 200, authState());
    return;
  }
  if (method === 'POST' && path === '/auth/signin') {
    void handleSignIn(req, res);
    return;
  }
  if (method === 'POST' && path === '/auth/signout') {
    signOut();
    json(res, 200, authState());
    return;
  }
  if (method === 'GET' && path === '/jobs') {
    json(res, 200, { jobs: listJobs() });
    return;
  }
  if (method === 'POST' && path === '/extract') {
    void handleExtract(req, res);
    return;
  }
  if (method === 'GET' && path === '/catalog') {
    json(res, 200, catalogBody(store));
    return;
  }
  if (method === 'PUT' && path.startsWith('/songs/') && path.endsWith('/chart')) {
    const id = decodeURIComponent(path.slice('/songs/'.length, -'/chart'.length));
    void (async () => {
      try {
        const parsed: unknown = JSON.parse(await readBody(req));
        const chordpro =
          typeof parsed === 'object' && parsed !== null && typeof (parsed as { chordpro?: unknown }).chordpro === 'string'
            ? (parsed as { chordpro: string }).chordpro
            : null;
        if (chordpro === null) {
          json(res, 400, { error: 'chordpro is required' });
          return;
        }
        const result = await setChart(store, id, chordpro);
        json(res, result.ok ? 200 : 403, result);
      } catch (err) {
        json(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return;
  }
  if (method === 'POST' && path.startsWith('/songs/') && path.endsWith('/rekey')) {
    const id = decodeURIComponent(path.slice('/songs/'.length, -'/rekey'.length));
    void (async () => {
      try {
        const parsed: unknown = JSON.parse(await readBody(req));
        const key =
          typeof parsed === 'object' && parsed !== null && typeof (parsed as { key?: unknown }).key === 'string'
            ? (parsed as { key: string }).key
            : null;
        if (key === null) {
          json(res, 400, { error: 'key is required' });
          return;
        }
        const result = await rekeySong(store, id, key);
        json(res, result.ok ? 200 : 403, result);
      } catch (err) {
        json(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return;
  }
  if (method === 'GET' && path.startsWith('/songs/') && path.endsWith('/access')) {
    const id = decodeURIComponent(path.slice('/songs/'.length, -'/access'.length));
    const song = store.getLocalSong(id);
    if (!song) {
      json(res, 404, { error: 'unknown local song' });
      return;
    }
    chartAccess(song).then(
      (access) => json(res, 200, { access }),
      (err: unknown) => json(res, 500, { error: err instanceof Error ? err.message : String(err) }),
    );
    return;
  }
  if (method === 'GET' && path.startsWith('/songs/')) {
    const id = decodeURIComponent(path.slice('/songs/'.length));
    const body = store.getSongDetail(id);
    if (body === null) json(res, 404, { error: 'unknown local song' });
    else json(res, 200, body);
    return;
  }
  if (method === 'GET' && path.startsWith('/performances/') && path.endsWith('/map')) {
    const id = decodeURIComponent(path.slice('/performances/'.length, -'/map'.length));
    json(res, 200, { rows: store.getSectionPartMap(id), sections: store.getSections(id) });
    return;
  }
  if (method === 'POST' && path.startsWith('/performances/') && path.endsWith('/map')) {
    const id = decodeURIComponent(path.slice('/performances/'.length, -'/map'.length));
    void (async () => {
      try {
        const parsed = JSON.parse(await readBody(req)) as { section_id?: string } & MapReviewAction;
        if (typeof parsed.section_id !== 'string') {
          json(res, 400, { error: 'section_id is required' });
          return;
        }
        reviewMapRow(store, id, parsed.section_id, parsed);
        json(res, 200, { ok: true, rows: store.getSectionPartMap(id) });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return;
  }
  if (method === 'POST' && path.startsWith('/performances/') && path.endsWith('/edit')) {
    void (async () => {
      try {
        const parsed = JSON.parse(await readBody(req)) as { op?: EditOperation };
        if (!parsed.op || typeof parsed.op !== 'object') {
          json(res, 400, { error: 'op is required' });
          return;
        }
        json(res, 200, { ok: true, result: applyEdit(store, parsed.op) });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return;
  }
  if (method === 'GET' && path.startsWith('/performances/')) {
    const id = decodeURIComponent(path.slice('/performances/'.length));
    const body = performanceBody(store, id);
    if (body === null) json(res, 404, { error: 'unknown performance' });
    else json(res, 200, body);
    return;
  }
  if (method === 'GET' && path.startsWith('/audio/')) {
    const file = resolveAudio(store, path);
    if (!file) json(res, 404, { error: 'unknown audio file' });
    else streamAudio(res, file);
    return;
  }
  if (method === 'GET' && path.startsWith('/bridge/candidates/')) {
    const localSongId = decodeURIComponent(path.slice('/bridge/candidates/'.length));
    bridgeCandidates(store, localSongId).then(
      (candidates) => json(res, 200, { candidates }),
      (err: unknown) => json(res, 400, { error: err instanceof Error ? err.message : String(err) }),
    );
    return;
  }
  if (method === 'POST' && path.startsWith('/link/')) {
    const localSongId = decodeURIComponent(path.slice('/link/'.length));
    void (async () => {
      let songId = '';
      try {
        const parsed: unknown = JSON.parse(await readBody(req));
        if (typeof parsed === 'object' && parsed !== null) {
          const record = parsed as Record<string, unknown>;
          if (typeof record.song_id === 'string') songId = record.song_id;
        }
      } catch {
        // no body → missing song_id, rejected below
      }
      if (!songId) {
        json(res, 400, { error: 'song_id is required — linking is human-confirmed (use /mint to create)' });
        return;
      }
      try {
        const result = await linkToSong(store, localSongId, songId);
        json(res, result.ok ? 200 : 400, result);
      } catch (err) {
        json(res, 500, { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return;
  }
  if (method === 'POST' && path.startsWith('/mint/')) {
    const localSongId = decodeURIComponent(path.slice('/mint/'.length));
    mintSong(store, localSongId).then(
      (result) => json(res, result.ok ? 200 : 400, result),
      (err: unknown) => json(res, 500, { error: err instanceof Error ? err.message : String(err) }),
    );
    return;
  }
  if (method === 'POST' && path.startsWith('/unlink/')) {
    const localSongId = decodeURIComponent(path.slice('/unlink/'.length));
    try {
      const result = unlinkLocalSong(store, localSongId);
      json(res, result.ok ? 200 : 400, result);
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  // Silent reconnect on boot: the stored refresh token IS the session.
  const auth = authState();
  console.log(
    `LaudStudio service on http://127.0.0.1:${PORT} (extract/jobs · catalog/performances/audio · link · auth)`,
  );
  console.log(auth.signed_in ? `auth: signed in as ${auth.email}` : 'auth: signed out');
});
