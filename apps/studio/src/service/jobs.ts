/**
 * Extraction job runner: runs extract.sh (pipeline + local ingest) one job at
 * a time, parsing stdout into stage progress. In-memory job store, PoC-grade.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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

export interface Job {
  id: string;
  youtube_url: string;
  reference_url: string | null;
  status: JobStatus;
  stages_done: Stage[];
  log: string[];
  /** Local song id once ingested (link it to the library via POST /link/:id). */
  song_id: string | null;
  created_at: string;
  finished_at: string | null;
}

const jobs: Job[] = [];
let chain: Promise<void> = Promise.resolve();

export const YOUTUBE_URL = /^https:\/\/(www\.)?(youtube\.com\/watch\?|youtu\.be\/)/;

/** Stage completion markers in the pipeline/ingest stdout. */
const STAGE_MARKERS: [Stage, RegExp][] = [
  ['download', /^download: /],
  ['ocr', /^ocr: (\d+ screens|cached)/],
  ['stems', /^stems: (4 stems|cached)/],
  ['analysis', /^analysis: (key |cached)/],
  ['assemble', /^assemble: manifest/],
  ['ingest', /^local store: song /],
  ['validation', /^validation report/],
];

export function listJobs(): Job[] {
  return [...jobs].reverse();
}

export function enqueueJob(youtubeUrl: string, referenceUrl: string | null): Job {
  const job: Job = {
    id: randomUUID(),
    youtube_url: youtubeUrl,
    reference_url: referenceUrl,
    status: 'queued',
    stages_done: [],
    log: [],
    song_id: null,
    created_at: new Date().toISOString(),
    finished_at: null,
  };
  jobs.push(job);
  chain = chain.then(() => runJob(job));
  return job;
}

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
      const song = trimmed.match(/^local store: song (\S+),/);
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
