/**
 * Song library: client-side search over title + lyrics + tags, language
 * filter, verified-only toggle, live from the Firestore emulator.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { COLLECTIONS, type Lang, type Song } from '@laude/song-model';
import { Card, Chip, EmptyState, Segmented, Toggle } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { usePlatformCollection, usePublicLyrics, usePublicSongs } from '@/platform/hooks';
import { linkFromDoc, lyricsFromDoc } from '@/platform/fire';
import { stripChordPro, translationMap } from '@/platform/utils';

export const Route = createFileRoute('/platform/library')({
  component: LibraryPage,
});

type LangFilter = 'all' | Lang;

function LibraryPage() {
  const t = useT();
  const songs = usePublicSongs();
  const lyrics = usePublicLyrics();
  const links = usePlatformCollection(COLLECTIONS.song_links, linkFromDoc);

  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<LangFilter>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const searchTextBySong = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lyrics.docs) {
      const prev = map.get(l.song_id) ?? '';
      map.set(l.song_id, `${prev} ${stripChordPro(l.chordpro)}`.toLowerCase());
    }
    return map;
  }, [lyrics.docs]);

  const translations = useMemo(() => translationMap(links.docs), [links.docs]);

  const needle = search.trim().toLowerCase();
  const visible = songs.docs.filter((song) => {
    if (langFilter !== 'all' && song.language !== langFilter) return false;
    if (verifiedOnly && !song.verified) return false;
    if (needle === '') return true;
    const haystack = `${song.canonical_title.toLowerCase()} ${song.tags.join(' ').toLowerCase()} ${
      searchTextBySong.get(song.id) ?? ''
    }`;
    return haystack.includes(needle);
  });

  return (
    <main className="ld-page ld-vstack">
      <h1>{t('library.title')}</h1>
      <div className="ld-hstack">
        <input
          className="ld-input"
          style={{ flex: 1, minWidth: '220px' }}
          placeholder={t('library.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Segmented<LangFilter>
          options={[
            { id: 'all', label: t('library.filter.all') },
            { id: 'ro', label: t('library.filter.ro') },
            { id: 'en', label: t('library.filter.en') },
          ]}
          value={langFilter}
          onChange={setLangFilter}
        />
        <Toggle on={verifiedOnly} onChange={setVerifiedOnly} label={t('library.filter.verifiedOnly')} />
      </div>
      <span className="ld-label">
        {visible.length} {t('library.songs')}
      </span>
      {songs.error !== null && <EmptyState>{t('platform.error')}</EmptyState>}
      {songs.error === null && songs.loading && <EmptyState>{t('common.loading')}</EmptyState>}
      {songs.error === null && !songs.loading && visible.length === 0 && (
        <EmptyState>{t('library.noResults')}</EmptyState>
      )}
      <div className="ld-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {visible.map((song) => (
          <SongCard key={song.id} song={song} translationId={translations.get(song.id)} />
        ))}
      </div>
    </main>
  );
}

function SongCard(props: { song: Song; translationId: string | undefined }) {
  const t = useT();
  const { song } = props;
  return (
    <Card>
      <div className="ld-vstack">
        <Link
          to="/platform/songs/$songId"
          params={{ songId: song.id }}
          style={{ color: 'inherit', fontWeight: 700 }}
        >
          {song.canonical_title}
        </Link>
        <div className="ld-hstack">
          <Chip>
            {t('common.key')}: {song.original_key}
          </Chip>
          <Chip>
            {song.default_bpm} {t('song.bpm')}
          </Chip>
          <Chip>{song.language === 'ro' ? t('library.filter.ro') : t('library.filter.en')}</Chip>
          {!song.verified && <Chip state="warn">{t('common.unverified')}</Chip>}
          {props.translationId !== undefined && (
            <Link to="/platform/songs/$songId" params={{ songId: props.translationId }}>
              <Chip state="queued">{t('library.translation')}</Chip>
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
