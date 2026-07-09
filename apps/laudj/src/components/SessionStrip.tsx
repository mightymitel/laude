import { useEffect, useState } from 'react';
import { Button, Chip, StatusDot } from '@laude/design-system';
import type { EngineState } from '@laude/laudj-control-protocol';
import { useT } from '@laude/i18n/react';
import { SessionClient, type DjMode, type SessionState } from '@laude/session';
import { engine } from '../engine';
import {
  DjSessionController,
  LAUDJ_PRESENTER,
  RELAY_URL,
  buildManifest,
  loadSavedCode,
  saveCode,
} from '../session-follow';
import { useSongs } from '../hooks';

export function SessionStrip({ state }: { state: EngineState }) {
  const t = useT();
  const songs = useSongs();
  const [code, setCode] = useState(loadSavedCode);
  const [joinedCode, setJoinedCode] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [mode, setMode] = useState<DjMode>('companion');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!joinedCode) return;
    let cancelled = false;
    let client: SessionClient | null = null;
    let controller: DjSessionController | null = null;
    let unsubSession: (() => void) | undefined;
    let unsubMode: (() => void) | undefined;

    SessionClient.connect({ url: RELAY_URL, code: joinedCode, member: LAUDJ_PRESENTER })
      .then((c) => {
        if (cancelled) {
          c.leave();
          return;
        }
        client = c;
        setError(null);
        engine.setSessionConnected(true);
        unsubSession = c.subscribe((change) => setSession(change.state));
        controller = new DjSessionController(c);
        controller.start();
        unsubMode = controller.onMode(setMode);
        // Advertise the local catalog (linked + local-only songs).
        buildManifest()
          .then((entries) => c.sendManifest(entries))
          .catch((err: unknown) => console.warn('LauDJ: manifest build failed', err));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setJoinedCode(null);
        }
      });

    return () => {
      cancelled = true;
      unsubMode?.();
      unsubSession?.();
      controller?.stop();
      engine.setSessionConnected(false);
      setSession(null);
      client?.leave();
    };
  }, [joinedCode]);

  const current = session?.current ?? null;
  const currentTitle = current?.song_id
    ? (songs.find((s) => s.song_id === current.song_id)?.title ?? current.song_id)
    : t('session.noSong');
  const sectionLabel =
    current && state.transport.song_id === current.song_id
      ? (state.transport.sections[current.section_index]?.label ?? `#${current.section_index + 1}`)
      : current
        ? `#${current.section_index + 1}`
        : '—';

  if (joinedCode === null) {
    return (
      <footer className="ld-topbar laudj-session">
        <StatusDot on={false} />
        <span className="ld-label">{t('laudj.followSession')}</span>
        <input
          className="ld-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('laudj.session.codePlaceholder')}
          style={{ width: 110 }}
        />
        <Button
          variant="primary"
          disabled={code.length < 6}
          onClick={() => {
            saveCode(code);
            setJoinedCode(code);
          }}
        >
          {t('laudj.session.join')}
        </Button>
        {error !== null && <Chip state="warn">{error}</Chip>}
      </footer>
    );
  }

  return (
    <footer className="ld-topbar laudj-session">
      <StatusDot on={state.session_connected} />
      <span className="ld-label">{t('laudj.followSession')}</span>
      <Chip state={mode === 'playback' ? 'current' : 'queued'}>
        {mode === 'playback' ? t('laudj.mode.playback') : t('laudj.mode.companion')}
      </Chip>
      {session === null || current === null ? (
        <span>{t('laudj.session.none')}</span>
      ) : (
        <>
          <strong>{currentTitle}</strong>
          <span className="ld-label">{t('session.section')}</span>
          <span>{sectionLabel}</span>
          <span className="ld-label">{t('common.key')}</span>
          <span>{current.key ?? '—'}</span>
          <span className="ld-label">{t('common.tempo')}</span>
          <span>{current.tempo_pct}%</span>
          <span className="ld-spacer" />
          <span className="ld-label">{t('session.presenters')}</span>
          {session.presenters.map((p) => (
            <Chip key={p.id} state={p.kind === 'dj' ? 'current' : 'default'}>
              {p.name}
              {p.mode !== undefined ? ` · ${p.mode}` : ''}
            </Chip>
          ))}
          <Button
            onClick={() => {
              setJoinedCode(null);
            }}
          >
            {t('laudj.session.leave')}
          </Button>
        </>
      )}
    </footer>
  );
}
