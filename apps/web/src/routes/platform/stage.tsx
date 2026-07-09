/**
 * Stage / present view (hero, dark, minimal chrome): joins a live session as
 * a VIEWER by access code (?code=XXXXXX) and shows only the current section
 * huge, chords transposed to the session key. Library songs resolve by-ref
 * (song ID → public library); by-value sessions render the embedded song's
 * key/title even without a library hit.
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';
import { renderChordPro, transposeAmount } from '@laude/chords';
import { Button, Chip, ChordLyricTracker, EmptyState } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { useSessionConnection } from '@/hooks/useSessionConnection';
import { usePublicLyrics, useSongDoc } from '@/platform/hooks';
import { clamp } from '@/platform/utils';

export const Route = createFileRoute('/platform/stage')({
  component: StagePage,
  validateSearch: (search: Record<string, unknown>) => {
    return { code: typeof search.code === 'string' ? search.code : undefined };
  },
});

function StagePage() {
  const { code } = Route.useSearch();

  if (code === undefined) return <CodePrompt />;
  return <StageView code={code} />;
}

/** No code in the URL → ask for one (the session page shows the viewer code). */
function CodePrompt() {
  const t = useT();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  return (
    <main className="ld-page ld-vstack" style={{ alignItems: 'flex-start' }}>
      <h1>{t('stage.title')}</h1>
      <span className="ld-label">{t('stage.enterCode')}</span>
      <div className="ld-hstack">
        <input
          className="ld-input"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="ABC123"
          style={{ width: 120 }}
        />
        <Button
          variant="primary"
          disabled={value.length < 6}
          onClick={() => void navigate({ to: '/platform/stage', search: { code: value } })}
        >
          {t('stage.join')}
        </Button>
      </div>
    </main>
  );
}

function StageView({ code }: { code: string }) {
  const t = useT();
  const { state: session, error } = useSessionConnection(code);
  const current = session?.current ?? null;
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
          {error !== null || song.error !== null ? t('platform.error') : t('stage.waiting')}
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
