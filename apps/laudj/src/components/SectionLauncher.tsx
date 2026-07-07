import { Card, Chip, EmptyState } from '@laude/design-system';
import type { EngineState } from '@laude/laudj-control-protocol';
import { useT } from '@laude/i18n/react';
import { engine, isFallbackUsed } from '../engine';
import { useSongs } from '../hooks';

export function SectionLauncher({ state }: { state: EngineState }) {
  const t = useT();
  const songs = useSongs();
  const { transport } = state;

  return (
    <Card>
      <div className="ld-hstack">
        <span className="ld-label">{t('laudj.sections')}</span>
        {isFallbackUsed() && <Chip state="warn">{t('laudj.mockSongs')}</Chip>}
        <span className="ld-spacer" />
        <select
          className="ld-select"
          value={transport.song_id ?? ''}
          onChange={(e) => {
            if (e.target.value) engine.send({ type: 'load_song', song_id: e.target.value });
          }}
        >
          <option value="" disabled>
            {t('session.pickSong')}
          </option>
          {songs.map((song) => (
            <option key={song.song_id} value={song.song_id}>
              {song.title}
            </option>
          ))}
        </select>
      </div>
      {transport.sections.length === 0 ? (
        <EmptyState>{t('common.empty')}</EmptyState>
      ) : (
        <div className="laudj-sections">
          {transport.sections.map((section, index) => (
            <Chip
              key={`${index}-${section.label}`}
              state={
                index === transport.current_section
                  ? 'current'
                  : index === transport.queued_section
                    ? 'queued'
                    : 'default'
              }
              onClick={() => engine.send({ type: 'launch_section', index })}
            >
              {section.label}
            </Chip>
          ))}
        </div>
      )}
    </Card>
  );
}
