/**
 * LaudStudio extraction UI: paste a YouTube link (+ optional melodia.ro reference), watch
 * the pipeline stages, open the song when it lands. Talks to the local
 * LaudStudio service (apps/laudstudio src/server.ts, port 3002).
 */
import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import '@laude/design-system/styles.css';
import { Button, Card, Chip, EmptyState } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import type { MessageKey } from '@laude/i18n';

const SERVICE_URL = 'http://127.0.0.1:3002';
const STAGES = ['download', 'ocr', 'stems', 'analysis', 'assemble', 'ingest', 'validation'] as const;
type Stage = (typeof STAGES)[number];
type JobStatus = 'queued' | 'running' | 'done' | 'error';

interface Job {
  id: string;
  youtube_url: string;
  reference_url: string | null;
  status: JobStatus;
  stages_done: Stage[];
  log: string[];
  song_id: string | null;
}

const STAGE_KEYS: Record<Stage, MessageKey> = {
  download: 'extract.stage.download',
  ocr: 'extract.stage.ocr',
  stems: 'extract.stage.stems',
  analysis: 'extract.stage.analysis',
  assemble: 'extract.stage.assemble',
  ingest: 'extract.stage.ingest',
  validation: 'extract.stage.validation',
};

const STATUS_KEYS: Record<JobStatus, MessageKey> = {
  queued: 'extract.status.queued',
  running: 'extract.status.running',
  done: 'extract.status.done',
  error: 'extract.status.error',
};

export const Route = createFileRoute('/extract')({
  component: ExtractPage,
});

function isJob(value: unknown): value is Job {
  return typeof value === 'object' && value !== null && 'id' in value && 'status' in value;
}

interface LinkState {
  status: 'linking' | 'done' | 'error';
  song_id?: string;
  error?: string;
}

interface StudioAuth {
  signed_in: boolean;
  email?: string;
}

function ExtractPage() {
  const t = useT();
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [serviceUp, setServiceUp] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, LinkState>>({});
  // Durable Studio sign-in (WP-108): the STUDIO holds the account, not this
  // page — we only show/set its standing state over the local service.
  const [auth, setAuth] = useState<StudioAuth | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshAuth = async () => {
    try {
      const res = await fetch(`${SERVICE_URL}/auth`);
      const data: unknown = await res.json();
      if (typeof data === 'object' && data !== null && typeof (data as StudioAuth).signed_in === 'boolean') {
        setAuth(data as StudioAuth);
      }
    } catch {
      setAuth(null);
    }
  };

  const studioSignIn = async () => {
    setAuthError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
        setAuthError(typeof record.error === 'string' ? record.error : `HTTP ${res.status}`);
        return;
      }
      setPassword('');
      await refreshAuth();
    } catch {
      setAuthError(t('extract.serviceDown'));
    }
  };

  const studioSignOut = async () => {
    try {
      await fetch(`${SERVICE_URL}/auth/signout`, { method: 'POST' });
    } finally {
      await refreshAuth();
    }
  };

  // Mint-or-link bridge: the ONLY cloud touch of the personal domain, and a
  // deliberate one — extraction itself never writes to the library.
  const linkSong = async (job: Job) => {
    if (job.song_id === null) return;
    setLinks((prev) => ({ ...prev, [job.id]: { status: 'linking' } }));
    try {
      const res = await fetch(`${SERVICE_URL}/link/${job.song_id}`, { method: 'POST' });
      const data: unknown = await res.json();
      const record =
        typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
      if (!res.ok || record.ok !== true || typeof record.song_id !== 'string') {
        const message = typeof record.error === 'string' ? record.error : `HTTP ${res.status}`;
        setLinks((prev) => ({ ...prev, [job.id]: { status: 'error', error: message } }));
        return;
      }
      setLinks((prev) => ({ ...prev, [job.id]: { status: 'done', song_id: String(record.song_id) } }));
    } catch {
      setLinks((prev) => ({ ...prev, [job.id]: { status: 'error', error: t('extract.serviceDown') } }));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${SERVICE_URL}/jobs`);
        const data: unknown = await res.json();
        if (cancelled) return;
        const list =
          typeof data === 'object' && data !== null && Array.isArray((data as { jobs?: unknown[] }).jobs)
            ? (data as { jobs: unknown[] }).jobs.filter(isJob)
            : [];
        setJobs(list);
        setServiceUp(true);
      } catch {
        if (!cancelled) setServiceUp(false);
      }
    };
    void poll();
    void refreshAuth();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setSubmitError(null);
    try {
      const res = await fetch(`${SERVICE_URL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_url: youtubeUrl, reference_url: referenceUrl || undefined }),
      });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const message =
          typeof data === 'object' && data !== null && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `HTTP ${res.status}`;
        setSubmitError(message);
        return;
      }
      setYoutubeUrl('');
      setReferenceUrl('');
    } catch {
      setServiceUp(false);
    }
  };

  return (
    <main className="ld-page ld-vstack">
      <h1>{t('extract.title')}</h1>
      {!serviceUp && <Chip state="warn">{t('extract.serviceDown')}</Chip>}

      <Card>
        <div className="ld-hstack">
          <span className="ld-label">{t('extract.auth.label')}</span>
          {auth?.signed_in === true ? (
            <>
              <Chip state="current">{auth.email}</Chip>
              <span className="ld-spacer" />
              <Button onClick={() => void studioSignOut()}>{t('extract.auth.signOut')}</Button>
            </>
          ) : (
            <>
              <input
                className="ld-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="demo@laude.local"
              />
              <input
                className="ld-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('extract.auth.password')}
              />
              <Button
                variant="primary"
                disabled={!email.trim() || !password}
                onClick={() => void studioSignIn()}
              >
                {t('extract.auth.signIn')}
              </Button>
              {authError !== null && <Chip state="warn">{authError}</Chip>}
            </>
          )}
        </div>
      </Card>

      <Card>
        <div className="ld-vstack">
          <label className="ld-vstack">
            <span className="ld-label">{t('extract.youtube')}</span>
            <input
              className="ld-input"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </label>
          <label className="ld-vstack">
            <span className="ld-label">{t('extract.reference')}</span>
            <input
              className="ld-input"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="https://melodia.ro/cantari/…"
            />
          </label>
          <div className="ld-hstack">
            <Button variant="primary" onClick={() => void submit()} disabled={!youtubeUrl.trim() || !serviceUp}>
              {t('extract.start')}
            </Button>
            {submitError !== null && <Chip state="warn">{submitError}</Chip>}
          </div>
          <span className="ld-label">{t('extract.hint')}</span>
        </div>
      </Card>

      <span className="ld-label">{t('extract.jobs')}</span>
      {jobs.length === 0 && <EmptyState>{t('extract.empty')}</EmptyState>}
      {jobs.map((job) => (
        <Card key={job.id}>
          <div className="ld-vstack">
            <div className="ld-hstack">
              <Chip state={job.status === 'running' ? 'current' : job.status === 'error' ? 'warn' : 'default'}>
                {t(STATUS_KEYS[job.status])}
              </Chip>
              <span style={{ overflowWrap: 'anywhere' }}>{job.youtube_url}</span>
              <span className="ld-spacer" />
              {job.status === 'done' && job.song_id !== null && (
                links[job.id]?.status === 'done' && links[job.id]?.song_id !== undefined ? (
                  <Link to="/library/$id" params={{ id: links[job.id].song_id ?? '' }}>
                    <Button variant="primary">{t('extract.openSong')}</Button>
                  </Link>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      disabled={links[job.id]?.status === 'linking'}
                      onClick={() => void linkSong(job)}
                    >
                      {links[job.id]?.status === 'linking' ? t('extract.linking') : t('extract.link')}
                    </Button>
                    {links[job.id]?.status === 'error' && (
                      <Chip state="warn">{links[job.id]?.error}</Chip>
                    )}
                  </>
                )
              )}
            </div>
            <div className="ld-hstack">
              {STAGES.map((stage) => (
                <Chip key={stage} state={job.stages_done.includes(stage) ? 'current' : 'default'}>
                  {t(STAGE_KEYS[stage])}
                </Chip>
              ))}
            </div>
            {(job.status === 'running' || job.status === 'error') && (
              <pre
                style={{
                  fontSize: 12,
                  maxHeight: 180,
                  overflow: 'auto',
                  background: 'var(--ld-bg-sunken)',
                  padding: 8,
                  borderRadius: 6,
                }}
              >
                {job.log.slice(-14).join('\n')}
              </pre>
            )}
          </div>
        </Card>
      ))}
    </main>
  );
}
