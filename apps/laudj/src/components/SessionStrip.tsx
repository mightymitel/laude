import { useEffect, useRef, useState } from 'react';
import { Chip, StatusDot } from '@laude/design-system';
import type { EngineState } from '@laude/laudj-control-protocol';
import { useT } from '@laude/i18n/react';
import { DEFAULT_SESSION_ID, SessionClient, type SessionChange } from '@laude/session';
import type { LiveSession, Presenter } from '@laude/song-model';
import { db } from '../firebase';
import { engine, padEngine } from '../engine';
import { useSongs } from '../hooks';

const LAUDJ_PRESENTER: Presenter = {
  id: 'laudj-engine',
  name: 'LauDJ',
  kind: 'laudj',
  joined_at: new Date().toISOString(),
};

/**
 * Yield rule + follow: a session write by a HUMAN presenter makes the engine
 * yield its auto-advance; while armed (auto-advance on, not yielded) LauDJ
 * follows the session — loads the session's song and mirrors its key to pads.
 */
function handleSessionChange(
  change: SessionChange,
  getEngineState: () => EngineState | null,
  isFirstSnapshot: boolean,
): void {
  const { session, external } = change;
  // The first snapshot after joining is the session's *existing* state, not a
  // live change — following it is fine, yielding to it is not.
  if (external && !isFirstSnapshot) {
    const writer = session.presenters.find((p) => p.id === session.updated_by);
    // Unknown writers are treated as human — safer to yield than to fight.
    const humanWriter = writer ? writer.kind === 'human' : true;
    if (humanWriter) engine.externalPresenterActed();
  }
  // The yield above lands synchronously, so re-read the engine state before
  // deciding whether auto-follow is still armed.
  const now = getEngineState();
  if (!now || !now.auto_advance || now.yielded) return;
  if (session.current.song_id && session.current.song_id !== now.transport.song_id) {
    engine.send({ type: 'load_song', song_id: session.current.song_id });
  }
  padEngine.setKey(session.current.key);
}

export function SessionStrip({ state }: { state: EngineState }) {
  const t = useT();
  const songs = useSongs();
  const [session, setSession] = useState<LiveSession | null>(null);
  const engineStateRef = useRef<EngineState | null>(null);

  useEffect(() => {
    const unsubEngine = engine.subscribe((s) => {
      engineStateRef.current = s;
    });
    const client = new SessionClient(db, DEFAULT_SESSION_ID, LAUDJ_PRESENTER);
    let unsubSession: (() => void) | undefined;
    let cancelled = false;
    client
      .join()
      .then(() => {
        if (cancelled) return;
        engine.setSessionConnected(true);
        let first = true;
        unsubSession = client.subscribe((change) => {
          setSession(change.session);
          handleSessionChange(change, () => engineStateRef.current, first);
          first = false;
        });
      })
      .catch((err: unknown) => {
        console.error('LauDJ: joining sessions/main failed', err);
      });
    return () => {
      cancelled = true;
      unsubSession?.();
      unsubEngine();
      engine.setSessionConnected(false);
      client.leave().catch((err: unknown) => {
        console.error('LauDJ: leaving the session failed', err);
      });
    };
  }, []);

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

  return (
    <footer className="ld-topbar laudj-session">
      <StatusDot on={state.session_connected} />
      <span className="ld-label">{t('laudj.followSession')}</span>
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
            <Chip key={p.id} state={p.kind === 'laudj' ? 'current' : 'default'}>
              {p.name}
            </Chip>
          ))}
        </>
      )}
    </footer>
  );
}
