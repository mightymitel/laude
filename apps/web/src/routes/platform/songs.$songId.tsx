/**
 * Song detail (hero view, calm/light): lyrics + chords rendered from
 * canonical ChordPro with notation + transpose controls.
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { COLLECTIONS } from '@laude/song-model';
import { renderChordPro, transposeKeyName, type RenderedSong } from '@laude/chords';
import { Button, Chip, ChordLyricTracker, EmptyState, Stepper } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { usePlatformCollection, usePublicLyrics, useSongDoc } from '@/platform/hooks';
import { linkFromDoc, lyricsFromDoc } from '@/platform/fire';
import { translationMap } from '@/platform/utils';
import { NotationControls } from '@/platform/components/NotationControls';

export const Route = createFileRoute('/platform/songs/$songId')({
  component: SongDetailPage,
});

function SongDetailPage() {
  const { songId } = Route.useParams();
  const t = useT();
  const navigate = useNavigate();

  const song = useSongDoc(songId);
  const lyrics = usePublicLyrics();
  const links = usePlatformCollection(COLLECTIONS.song_links, linkFromDoc);

  const [notation, setNotation] = useState('english');
  const [transpose, setTranspose] = useState(0);

  const songLyrics = useMemo(() => {
    const forSong = lyrics.docs.filter((l) => l.song_id === songId);
    return forSong.find((l) => song.value !== null && l.lang === song.value.language) ?? forSong[0];
  }, [lyrics.docs, songId, song.value]);

  const rendered: RenderedSong | null = useMemo(() => {
    if (songLyrics === undefined || songLyrics.chordpro === '') return null;
    try {
      return renderChordPro(songLyrics.chordpro, { notation, transpose });
    } catch (err) {
      console.error('[platform] chordpro render failed', err);
      return null;
    }
  }, [songLyrics, notation, transpose]);

  if (song.loading) {
    return <main className="ld-page"><EmptyState>{t('common.loading')}</EmptyState></main>;
  }
  if (song.error !== null) {
    return <main className="ld-page"><EmptyState>{t('platform.error')}</EmptyState></main>;
  }
  if (song.value === null) {
    return <main className="ld-page"><EmptyState>{t('song.notFound')}</EmptyState></main>;
  }

  const s = song.value;
  const currentKey = transposeKeyName(s.original_key, transpose);
  const translationId = translationMap(links.docs).get(s.id);

  return (
    <main className="ld-page ld-vstack">
      <div className="ld-hstack">
        <h1>{s.canonical_title}</h1>
        <Chip>
          {t('common.key')}: {currentKey}
        </Chip>
        <Chip>
          {s.default_bpm} {t('song.bpm')}
        </Chip>
        {!s.verified && <Chip state="warn">{t('common.unverified')}</Chip>}
        <span className="ld-spacer" />
        <Button
          variant="primary"
          onClick={() => navigate({ to: '/platform/karaoke/$songId', params: { songId: s.id } })}
        >
          {t('song.openKaraoke')}
        </Button>
        <Button onClick={() => navigate({ to: '/platform/stage' })}>{t('song.openStage')}</Button>
      </div>

      {translationId !== undefined && (
        <Link to="/platform/songs/$songId" params={{ songId: translationId }}>
          {t('song.translationLink')}
        </Link>
      )}

      <div className="ld-hstack">
        <span className="ld-label">{t('song.notation')}</span>
        <NotationControls value={notation} onChange={setNotation} />
      </div>
      <div className="ld-hstack">
        <span className="ld-label">{t('song.transpose')}</span>
        <Stepper
          value={currentKey}
          onDecrement={() => setTranspose((v) => v - 1)}
          onIncrement={() => setTranspose((v) => v + 1)}
        />
        <Button variant="ghost" onClick={() => setTranspose(0)} disabled={transpose === 0}>
          {t('song.original')}
        </Button>
      </div>

      <span className="ld-label">{t('song.lyricsChords')}</span>
      {rendered === null ? (
        <EmptyState>{lyrics.loading ? t('common.loading') : t('common.empty')}</EmptyState>
      ) : (
        <ChordLyricTracker
          sections={rendered.sections.map((sec) => ({ label: sec.label, lines: sec.lines }))}
        />
      )}

    </main>
  );
}
