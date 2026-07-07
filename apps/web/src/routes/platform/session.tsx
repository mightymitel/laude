/**
 * Live session control (presenter surface): joins sessions/main as a human
 * peer presenter, drives song/section/key/tempo/blank + companion directives.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { COLLECTIONS, type LiveSession, type PresenterKind } from '@laude/song-model';
import { DEFAULT_SESSION_ID, SessionClient } from '@laude/session';
import { renderChordPro, transposeKeyName } from '@laude/chords';
import { Button, Chip, EmptyState, StatusDot, Stepper, Toggle } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { db } from '@/lib/firebase';
import { usePlatformCollection, usePublicSongs } from '@/platform/hooks';
import { lyricsFromDoc } from '@/platform/fire';
import { loadPresenter } from '@/platform/presenter';
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
  const client = useMemo(() => new SessionClient(db, DEFAULT_SESSION_ID, loadPresenter()), []);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client.join().catch((err: unknown) => setError(String(err)));
    return client.subscribe((change) => setSession(change.session));
  }, [client]);

  const run = (promise: Promise<void>) => {
    promise.catch((err: unknown) => setError(String(err)));
  };

  const songs = usePublicSongs();
  const lyricsCol = usePlatformCollection(COLLECTIONS.song_lyrics, lyricsFromDoc);

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
    return <main className="ld-page"><EmptyState>{t('common.loading')}</EmptyState></main>;
  }

  const sectionIndex = clamp(session.current.section_index, 0, Math.max(0, sections.length - 1));
  const key = session.current.key ?? currentSong?.original_key ?? null;
  const tempo = session.current.tempo_pct;
  const lastBy =
    session.presenters.find((p) => p.id === session.updated_by)?.name ?? session.updated_by;
  const kindLabels: Record<PresenterKind, string> = {
    human: t('presenter.kind.human'),
    laudj: t('presenter.kind.laudj'),
    mic: t('presenter.kind.mic'),
  };

  return (
    <main className="ld-page ld-vstack">
      <div className="ld-hstack">
        <h1>{t('session.title')}</h1>
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
              run(client.setCurrent({ song_id: song.id, section_index: 0, key: song.original_key }))
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
                  onClick={() => run(client.setCurrent({ section_index: i }))}
                >
                  {sec.label !== '' ? sec.label : String(i + 1)}
                </Chip>
              ))}
            </div>
          )}
          <div className="ld-hstack">
            <Button
              big
              onClick={() => run(client.setCurrent({ section_index: Math.max(0, sectionIndex - 1) }))}
              disabled={sections.length === 0 || sectionIndex === 0}
            >
              ← {t('session.prevPart')}
            </Button>
            <Button
              big
              onClick={() =>
                run(client.setCurrent({ section_index: Math.min(sections.length - 1, sectionIndex + 1) }))
              }
              disabled={sections.length === 0 || sectionIndex >= sections.length - 1}
            >
              {t('session.nextPart')} →
            </Button>
            <Toggle
              on={session.current.blank}
              onChange={(on) => run(client.setCurrent({ blank: on }))}
              label={t('session.blank')}
            />
          </div>
          <div className="ld-hstack">
            <span className="ld-label">{t('common.key')}</span>
            <Stepper
              value={key ?? '—'}
              onDecrement={() => {
                if (key !== null) run(client.setCurrent({ key: transposeKeyName(key, -1) }));
              }}
              onIncrement={() => {
                if (key !== null) run(client.setCurrent({ key: transposeKeyName(key, 1) }));
              }}
            />
            <span className="ld-label">{t('session.tempo')}</span>
            <Stepper
              value={`${tempo}%`}
              onDecrement={() =>
                run(client.setCurrent({ tempo_pct: clamp(tempo - TEMPO_STEP, TEMPO_MIN, TEMPO_MAX) }))
              }
              onIncrement={() =>
                run(client.setCurrent({ tempo_pct: clamp(tempo + TEMPO_STEP, TEMPO_MIN, TEMPO_MAX) }))
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
                <Chip state={p.kind === 'laudj' ? 'queued' : 'default'}>{kindLabels[p.kind]}</Chip>
                <span className="ld-label">{p.id}</span>
              </div>
            ))
          )}
        </div>

        <div className="ld-card">
          <CompanionPanel
            companion={session.companion}
            onPatch={(patch) => run(client.setCompanion(patch))}
          />
        </div>
      </div>
    </main>
  );
}
