/**
 * Karaoke player (dark stage theme): LRC-timed lyrics highlighted against a
 * mock local clock (no real audio in the wireframe), chords hidden.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COLLECTIONS } from '@laude/song-model';
import { Button, Chip, ChordLyricTracker, EmptyState } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { usePlatformCollection, useSongDoc } from '@/platform/hooks';
import { lyricsFromDoc } from '@/platform/fire';
import { formatTime } from '@/platform/utils';

export const Route = createFileRoute('/platform/karaoke/$songId')({
  component: KaraokePage,
});

const TICK_MS = 100;

function KaraokePage() {
  const { songId } = Route.useParams();
  const t = useT();
  const song = useSongDoc(songId);
  const lyrics = usePlatformCollection(COLLECTIONS.song_lyrics, lyricsFromDoc);

  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lrc = useMemo(() => {
    const forSong = lyrics.docs.filter((l) => l.song_id === songId && l.lrc !== undefined);
    const preferred =
      forSong.find((l) => song.value !== null && l.lang === song.value.language) ?? forSong[0];
    return preferred?.lrc;
  }, [lyrics.docs, songId, song.value]);

  // Mock audio: a local interval clock stands in for playback.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setPosition((p) => p + TICK_MS / 1000), TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  const currentLine = useMemo(() => {
    if (lrc === undefined) return -1;
    let idx = -1;
    lrc.forEach((line, i) => {
      if (line.time_s <= position) idx = i;
    });
    return idx;
  }, [lrc, position]);

  useEffect(() => {
    scrollRef.current
      ?.querySelector('.ld-tracker__line--current')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentLine]);

  const title = song.value?.canonical_title ?? '';

  return (
    <main className="ld-page ld-vstack">
      <div className="ld-hstack">
        <h1>
          {t('karaoke.title')}
          {title !== '' ? ` — ${title}` : ''}
        </h1>
        <span className="ld-spacer" />
        <Chip state="warn">{t('karaoke.mockAudio')}</Chip>
      </div>

      {song.error !== null || lyrics.error !== null ? (
        <EmptyState>{t('platform.error')}</EmptyState>
      ) : lyrics.loading || song.loading ? (
        <EmptyState>{t('common.loading')}</EmptyState>
      ) : lrc === undefined ? (
        <EmptyState>{t('song.noLrc')}</EmptyState>
      ) : (
        <>
          <div className="ld-hstack">
            <Button big variant="primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? t('karaoke.pause') : t('karaoke.play')}
            </Button>
            <Button
              big
              onClick={() => {
                setPlaying(false);
                setPosition(0);
              }}
            >
              {t('karaoke.restart')}
            </Button>
            <span className="ld-stepper__value">{formatTime(position)}</span>
          </div>
          <div ref={scrollRef} style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <ChordLyricTracker
              stage
              showChords={false}
              currentLine={currentLine}
              sections={[
                {
                  label: '',
                  lines: lrc.map((line) => ({ items: [{ chord: '', lyrics: line.text }] })),
                },
              ]}
            />
          </div>
        </>
      )}
    </main>
  );
}
