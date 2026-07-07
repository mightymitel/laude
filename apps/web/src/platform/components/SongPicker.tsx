/** Searchable song list used by the session view to set the current song. */
import { useState } from 'react';
import type { Song } from '@laude/song-model';
import { EmptyState } from '@laude/design-system';
import { useT } from '@laude/i18n/react';

const MAX_RESULTS = 8;

export function SongPicker(props: {
  songs: Song[];
  currentId: string | null;
  onPick: (song: Song) => void;
}) {
  const t = useT();
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const matches = props.songs
    .filter((s) => needle === '' || s.canonical_title.toLowerCase().includes(needle))
    .slice(0, MAX_RESULTS);

  return (
    <div className="ld-vstack">
      <input
        className="ld-input"
        placeholder={t('library.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {matches.length === 0 ? (
        <EmptyState>{t('library.noResults')}</EmptyState>
      ) : (
        <div>
          {matches.map((song) => (
            <div key={song.id} className="ld-row" onClick={() => props.onPick(song)}>
              <span style={{ fontWeight: song.id === props.currentId ? 700 : 400 }}>
                {song.canonical_title}
              </span>
              <span className="ld-spacer" />
              <span className="ld-chip">{song.original_key}</span>
              <span className="ld-chip">
                {song.default_bpm} {t('song.bpm')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
