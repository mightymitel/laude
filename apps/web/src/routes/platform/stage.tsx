/**
 * Stage / present view (hero, dark, minimal chrome): follows sessions/main and
 * shows only the current section huge, chords transposed to the session key.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, type ReactNode } from 'react';
import { COLLECTIONS } from '@laude/song-model';
import { renderChordPro, transposeAmount } from '@laude/chords';
import { Chip, ChordLyricTracker, EmptyState } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { DEFAULT_SESSION_ID } from '@laude/session';
import { usePublicLyrics, useSessionCurrent, useSongDoc } from '@/platform/hooks';
import { lyricsFromDoc } from '@/platform/fire';
import { clamp } from '@/platform/utils';

export const Route = createFileRoute('/platform/stage')({
  component: StagePage,
});

function StagePage() {
  const t = useT();
  const sessionState = useSessionCurrent(DEFAULT_SESSION_ID);
  const current = sessionState.current;
  const song = useSongDoc(current?.song_id ?? null);
  const lyricsCol = usePublicLyrics();

  const rendered = useMemo(() => {
    const s = song.value;
    if (s === null || current === null) return null;
    const lyric =
      lyricsCol.docs.find((l) => l.song_id === s.id && l.lang === s.language) ??
      lyricsCol.docs.find((l) => l.song_id === s.id);
    if (lyric === undefined || lyric.chordpro === '') return null;
    const transpose = current.key !== null ? transposeAmount(s.original_key, current.key) : 0;
    try {
      return renderChordPro(lyric.chordpro, { transpose });
    } catch (err) {
      console.error('[platform] chordpro render failed', err);
      return null;
    }
  }, [song.value, current, lyricsCol.docs]);

  const frame = (children: ReactNode, center = false) => (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: center ? 'center' : 'flex-start',
        alignItems: center ? 'center' : 'stretch',
        padding: '24px',
        background: 'var(--ld-bg-sunken)',
      }}
    >
      {children}
    </main>
  );

  if (current === null || current.song_id === null || song.value === null) {
    return frame(
      <div className="ld-vstack" style={{ alignItems: 'center' }}>
        <span className="ld-label">
          {sessionState.error !== null || song.error !== null ? t('platform.error') : t('stage.waiting')}
        </span>
        <Link to="/platform" className="ld-label">
          {t('common.back')}
        </Link>
      </div>,
      true,
    );
  }

  if (current.blank) {
    return frame(<span className="ld-label">{t('stage.blank')}</span>, true);
  }

  const sections = rendered?.sections ?? [];
  const section = sections[clamp(current.section_index, 0, Math.max(0, sections.length - 1))];
  const displayKey = current.key ?? song.value.original_key;

  return frame(
    <>
      <div className="ld-hstack" style={{ marginBottom: '16px' }}>
        {section !== undefined && <Chip state="current">{section.label}</Chip>}
        <span className="ld-label">{song.value.canonical_title}</span>
        <span className="ld-spacer" />
        <Chip>
          {t('common.key')}: {displayKey}
        </Chip>
      </div>
      {section === undefined ? (
        <EmptyState>{lyricsCol.loading ? t('common.loading') : t('common.empty')}</EmptyState>
      ) : (
        <ChordLyricTracker stage sections={[{ label: '', lines: section.lines }]} />
      )}
    </>,
  );
}
