/**
 * Live session control (presenter surface): the demo user goes live on the
 * relay (mints viewer + presenter links), then drives song/section/key/tempo/
 * blank + companion directives over @laude/session. The roster shows every
 * connected presenter with its self-declared kind (human / dj / mic).
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PresenterKind } from '@laude/song-model';
import { renderChordPro, transposeKeyName } from '@laude/chords';
import { Button, Chip, EmptyState, StatusDot, Stepper, Toggle } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { auth } from '@/lib/firebase';
import { useLiveSession } from '@/hooks/useLiveSession';
import { usePublicLyrics, usePublicSongs } from '@/platform/hooks';
import { clamp } from '@/platform/utils';
import { SongPicker } from '@/platform/components/SongPicker';
import { CompanionPanel } from '@/platform/components/CompanionPanel';

export const Route = createFileRoute('/platform/session')({
  component: SessionPage,
});

const TEMPO_MIN = 75;
const TEMPO_MAX = 125;
const TEMPO_STEP = 5;

function SessionPage() {
  const t = useT();
  const { session, isLive, isLoading, error, startLive, updateSession } = useLiveSession();

  // Go live automatically once the demo sign-in (platform route layout) lands.
  const autoStarted = useRef(false);
  const [authReady, setAuthReady] = useState(auth.currentUser !== null);
  useEffect(() => auth.onAuthStateChanged((user) => setAuthReady(user !== null)), []);
  useEffect(() => {
    if (authReady && !autoStarted.current && !isLive && !isLoading) {
      autoStarted.current = true;
      void startLive();
    }
  }, [authReady, isLive, isLoading, startLive]);

  const songs = usePublicSongs();
  const lyricsCol = usePublicLyrics();

  const current = session?.current;
  const currentSong =
    current !== undefined && current.song_id !== null
      ? (songs.docs.find((s) => s.id === current.song_id) ?? null)
      : null;

  const sections = useMemo(() => {
    if (currentSong === null) return [];
    const lyric =
      lyricsCol.docs.find((l) => l.song_id === currentSong.id && l.lang === currentSong.language) ??
      lyricsCol.docs.find((l) => l.song_id === currentSong.id);
    if (lyric === undefined || lyric.chordpro === '') return [];
    try {
      return renderChordPro(lyric.chordpro).sections;
    } catch (err) {
      console.error('[platform] chordpro render failed', err);
      return [];
    }
  }, [currentSong, lyricsCol.docs]);

  if (session === null) {
    return (
      <main className="ld-page ld-vstack">
        <EmptyState>{error ?? t('common.loading')}</EmptyState>
      </main>
    );
  }

  const sectionIndex = clamp(session.current.section_index, 0, Math.max(0, sections.length - 1));
  const key = session.current.key ?? currentSong?.original_key ?? null;
  const tempo = session.current.tempo_pct;
  const lastBy =
    session.presenters.find((p) => p.id === session.updated_by)?.name ?? session.updated_by;
  const kindLabels: Record<PresenterKind, string> = {
    human: t('presenter.kind.human'),
    dj: t('presenter.kind.dj'),
    mic: t('presenter.kind.mic'),
  };

  return (
    <main className="ld-page ld-vstack">
      <div className="ld-hstack">
        <h1>{t('session.title')}</h1>
        <Chip state="current">{t('session.viewerCode')}: {session.accessCode}</Chip>
        {session.presenterCode !== undefined && (
          <Chip>{t('session.presenterCode')}: {session.presenterCode}</Chip>
        )}
        <Link to="/platform/stage" search={{ code: session.accessCode }}>
          {t('session.openStage')}
        </Link>
        <span className="ld-spacer" />
        <span className="ld-label">
          {t('session.lastUpdatedBy')}: {lastBy}
        </span>
      </div>
      {error !== null && <Chip state="warn">{error}</Chip>}

      <div className="ld-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="ld-card ld-vstack">
          <span className="ld-label">{t('session.currentSong')}</span>
          <strong>{currentSong !== null ? currentSong.canonical_title : t('session.noSong')}</strong>
          <span className="ld-label">{t('session.pickSong')}</span>
          <SongPicker
            songs={songs.docs}
            currentId={session.current.song_id}
            onPick={(song) =>
              updateSession({ current: { song_id: song.id, section_index: 0, key: song.original_key } })
            }
          />
        </div>

        <div className="ld-card ld-vstack">
          <span className="ld-label">{t('session.section')}</span>
          {sections.length === 0 ? (
            <EmptyState>{t('session.noSong')}</EmptyState>
          ) : (
            <div className="ld-hstack">
              {sections.map((sec, i) => (
                <Chip
                  key={i}
                  state={i === sectionIndex ? 'current' : 'default'}
                  onClick={() => updateSession({ current: { section_index: i } })}
                >
                  {sec.label !== '' ? sec.label : String(i + 1)}
                </Chip>
              ))}
            </div>
          )}
          <div className="ld-hstack">
            <Button
              big
              onClick={() => updateSession({ current: { section_index: Math.max(0, sectionIndex - 1) } })}
              disabled={sections.length === 0 || sectionIndex === 0}
            >
              ← {t('session.prevPart')}
            </Button>
            <Button
              big
              onClick={() =>
                updateSession({ current: { section_index: Math.min(sections.length - 1, sectionIndex + 1) } })
              }
              disabled={sections.length === 0 || sectionIndex >= sections.length - 1}
            >
              {t('session.nextPart')} →
            </Button>
            <Toggle
              on={session.current.blank}
              onChange={(on) => updateSession({ current: { blank: on } })}
              label={t('session.blank')}
            />
          </div>
          <div className="ld-hstack">
            <span className="ld-label">{t('common.key')}</span>
            <Stepper
              value={key ?? '—'}
              onDecrement={() => {
                if (key !== null) updateSession({ current: { key: transposeKeyName(key, -1) } });
              }}
              onIncrement={() => {
                if (key !== null) updateSession({ current: { key: transposeKeyName(key, 1) } });
              }}
            />
            <span className="ld-label">{t('session.tempo')}</span>
            <Stepper
              value={`${tempo}%`}
              onDecrement={() =>
                updateSession({ current: { tempo_pct: clamp(tempo - TEMPO_STEP, TEMPO_MIN, TEMPO_MAX) } })
              }
              onIncrement={() =>
                updateSession({ current: { tempo_pct: clamp(tempo + TEMPO_STEP, TEMPO_MIN, TEMPO_MAX) } })
              }
            />
          </div>
        </div>

        <div className="ld-card ld-vstack">
          <span className="ld-label">{t('session.presenters')}</span>
          {session.presenters.length === 0 ? (
            <EmptyState>{t('common.empty')}</EmptyState>
          ) : (
            session.presenters.map((p) => (
              <div key={p.id} className="ld-hstack">
                <StatusDot on={p.id === session.updated_by} />
                <span>{p.name}</span>
                <Chip state={p.kind === 'dj' ? 'queued' : 'default'}>{kindLabels[p.kind]}</Chip>
                <span className="ld-label">{p.id}</span>
              </div>
            ))
          )}
          {session.dj_manifest.length > 0 && (
            <>
              <span className="ld-label">{t('session.djManifest')}</span>
              {session.dj_manifest.map((entry) => (
                <div key={entry.local_song_id} className="ld-hstack">
                  <span>{entry.title}</span>
                  <Chip state={entry.song_id !== null ? 'current' : 'queued'}>
                    {entry.song_id !== null ? t('session.djLinked') : t('session.djLocal')}
                  </Chip>
                  {entry.has_stems && <span className="ld-label">{entry.key} · {entry.bpm} BPM</span>}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="ld-card">
          <CompanionPanel
            companion={session.companion}
            onPatch={(patch) => updateSession({ companion: patch })}
          />
        </div>
      </div>
    </main>
  );
}
