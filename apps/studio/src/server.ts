/**
 * LaudStudio local service — the personal-domain HTTP surface on one port:
 *   POST /extract { youtube_url, reference_url? }      -> 202 { id }
 *   GET  /jobs                                         -> extraction job list
 *   GET  /catalog                                      -> playable songs (LauDJ)
 *   GET  /songs/:localSongId                           -> work-level detail (the chart)
 *   GET  /performances/:id                             -> grid/chord events/sections/LRC
 *   GET  /audio/:perfId/(stem/:stem|variant/:stem/:n|mixdown) -> audio files
 *   POST /link/:localSongId                            -> mint-or-link bridge (STUB)
 *   GET  /health
 * Node stdlib only for HTTP; state lives in the SQLite store (src/store).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { enqueueJob, listJobs, YOUTUBE_URL } from './service/jobs';
import { catalogBody, performanceBody, resolveAudio, streamAudio } from './service/catalog';
import { linkOrMint } from './service/link';
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
  if (method === 'GET' && path.startsWith('/songs/')) {
    const id = decodeURIComponent(path.slice('/songs/'.length));
    const body = store.getSongDetail(id);
    if (body === null) json(res, 404, { error: 'unknown local song' });
    else json(res, 200, body);
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
  if (method === 'POST' && path.startsWith('/link/')) {
    const localSongId = decodeURIComponent(path.slice('/link/'.length));
    linkOrMint(store, localSongId).then(
      (result) => json(res, result.ok ? 200 : 400, result),
      (err: unknown) => json(res, 500, { error: err instanceof Error ? err.message : String(err) }),
    );
    return;
  }
  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(
    `LaudStudio service on http://127.0.0.1:${PORT} (extract/jobs · catalog/performances/audio · link)`,
  );
});
