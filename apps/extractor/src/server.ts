/**
 * Extractor service — a tiny local HTTP API the platform UI talks to:
 *   POST /extract { youtube_url, reference_url? } -> 202 { id }
 *   GET  /jobs                                    -> job list (newest first)
 *   GET  /health
 *
 * Runs extract.sh (pipeline + ingest) one job at a time, parsing stdout into
 * stage progress. In-memory job store — PoC-grade, node stdlib only.
 */
import { createServer, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.EXTRACTOR_PORT ?? 3002);
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LOG_LINES = 300;

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export const STAGES = [
  'download',
  'ocr',
  'stems',
  'analysis',
  'assemble',
  'ingest',
  'validation',
] as const;
export type Stage = (typeof STAGES)[number];

interface Job {
  id: string;
  youtube_url: string;
  reference_url: string | null;
  status: JobStatus;
  stages_done: Stage[];
  log: string[];
  song_id: string | null;
  created_at: string;
  finished_at: string | null;
}

const jobs: Job[] = [];
let chain: Promise<void> = Promise.resolve();

const YOUTUBE_URL = /^https:\/\/(www\.)?(youtube\.com\/watch\?|youtu\.be\/)/;

/** Stage completion markers in the pipeline/ingest stdout. */
const STAGE_MARKERS: [Stage, RegExp][] = [
  ['download', /^download: /],
  ['ocr', /^ocr: (\d+ screens|cached)/],
  ['stems', /^stems: (4 stems|cached)/],
  ['analysis', /^analysis: (key |cached)/],
  ['assemble', /^assemble: manifest/],
  ['ingest', /^firestore: song /],
  ['validation', /^validation report/],
];

function runJob(job: Job): Promise<void> {
  return new Promise((resolve) => {
    job.status = 'running';
    const args = ['extract.sh', job.youtube_url];
    if (job.reference_url) args.push(job.reference_url);
    const child = spawn('bash', args, { cwd: APP_DIR });

    const onLine = (line: string) => {
      const trimmed = line.trimEnd();
      if (!trimmed) return;
      job.log.push(trimmed);
      if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
      for (const [stage, marker] of STAGE_MARKERS) {
        if (marker.test(trimmed) && !job.stages_done.includes(stage)) job.stages_done.push(stage);
      }
      const song = trimmed.match(/^firestore: song (\S+),/);
      if (song) job.song_id = song[1];
    };

    let buffer = '';
    const consume = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(onLine);
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);

    child.on('close', (code) => {
      if (buffer) onLine(buffer);
      job.status = code === 0 ? 'done' : 'error';
      job.finished_at = new Date().toISOString();
      resolve();
    });
    child.on('error', (err) => {
      onLine(`spawn failed: ${err.message}`);
      job.status = 'error';
      job.finished_at = new Date().toISOString();
      resolve();
    });
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET' && req.url === '/jobs') {
    json(res, 200, { jobs: [...jobs].reverse() });
    return;
  }
  if (req.method === 'POST' && req.url === '/extract') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        json(res, 400, { error: 'invalid JSON' });
        return;
      }
      const record = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
      const youtubeUrl = typeof record.youtube_url === 'string' ? record.youtube_url.trim() : '';
      const referenceUrl = typeof record.reference_url === 'string' ? record.reference_url.trim() : '';
      if (!YOUTUBE_URL.test(youtubeUrl)) {
        json(res, 400, { error: 'youtube_url must be a https://www.youtube.com/watch?v=… or youtu.be link' });
        return;
      }
      const job: Job = {
        id: randomUUID(),
        youtube_url: youtubeUrl,
        reference_url: referenceUrl || null,
        status: 'queued',
        stages_done: [],
        log: [],
        song_id: null,
        created_at: new Date().toISOString(),
        finished_at: null,
      };
      jobs.push(job);
      chain = chain.then(() => runJob(job));
      json(res, 202, { id: job.id });
    });
    return;
  }
  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`extractor service on http://127.0.0.1:${PORT} (POST /extract, GET /jobs)`);
});
