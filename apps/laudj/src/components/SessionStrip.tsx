import { useEffect, useRef, useState } from 'react';
import { Chip, StatusDot } from '@laude/design-system';
import type { EngineState } from '@laude/laudj-control-protocol';
import { useT } from '@laude/i18n/react';
import { DEFAULT_SESSION_ID, SessionClient, type SessionChange } from '@laude/session';
import type { CompanionDirectives, LiveSession, Presenter } from '@laude/song-model';
import { db } from '../firebase';
import { engine, padEngine } from '../engine';
import { padsController, padStyleOf } from '../pads-controller';
import { useSongs } from '../hooks';

/** Re-joins with fresh joined_at accumulate duplicate presenter entries in the
 * session doc (no heartbeat/TTL in the PoC) — render each id once. */
function dedupeById(presenters: Presenter[]): Presenter[] {
  const seen = new Set<string>();
  return presenters.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

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
  prev: LiveSession | null,
): void {
  const { session, external } = change;
  // Yield only on external changes to MUSICAL INTENT (tier 1, `current.*`).
  // Companion directives (tier 2) are meant to be obeyed, not yielded to, and
  // the first snapshot after joining is existing state, not a change.
  const currentChanged =
    prev !== null && JSON.stringify(prev.current) !== JSON.stringify(session.current);
  if (external && currentChanged) {
    const writer = session.presenters.find((p) => p.id === session.updated_by);
    // Unknown writers are treated as human — safer to yield than to fight.
    const humanWriter = writer ? writer.kind === 'human' : true;
    if (humanWriter) engine.externalPresenterActed();
  }
  // FOLLOW is unconditional ("react" behaviour): the engine always mirrors
  // the session's song/key. Yield only pauses LauDJ's own auto-advance —
  // it never stops LauDJ from obeying the human presenter.
  const now = getEngineState();
  if (now) {
    if (session.current.song_id && session.current.song_id !== now.transport.song_id) {
      engine.send({ type: 'load_song', song_id: session.current.song_id });
    }
    padEngine.setKey(session.current.key);
  }
  applyCompanion(prev?.companion ?? null, session);
}

/**
 * Companion mode (tier 2): the worship leader drives the pads from the
 * Laudasist session — pads on/off for song parts, style, volume, and the
 * instrumental interlude. Only deltas are applied, so local operator tweaks
 * survive until the leader changes something.
 */
function applyCompanion(prev: CompanionDirectives | null, session: LiveSession): void {
  const next = session.companion;
  const key = session.current.key;
  if (next.pad_style !== prev?.pad_style) padsController.setStyle(padStyleOf(next.pad_style));
  if (next.pad_volume !== prev?.pad_volume) padsController.setVolume(next.pad_volume);
  if ((prev?.pads_on ?? false) !== (next.pads_on ?? false)) {
    if (next.pads_on) padsController.start(key);
    else padsController.stop();
  }
  if ((prev?.interlude ?? false) !== next.interlude) {
    void padsController.setInterlude(next.interlude, session.current.song_id, key);
  }
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
        let prev: LiveSession | null = null;
        unsubSession = client.subscribe((change) => {
          setSession(change.session);
          handleSessionChange(change, () => engineStateRef.current, prev);
          prev = change.session;
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
          {dedupeById(session.presenters).map((p) => (
            <Chip key={p.id} state={p.kind === 'laudj' ? 'current' : 'default'}>
              {p.name}
            </Chip>
          ))}
        </>
      )}
    </footer>
  );
}
