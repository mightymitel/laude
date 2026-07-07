/**
 * Parts palette: browse any registered song's sections (without loading it).
 * Chip CLICK = launch now — unchanged muscle memory on the loaded song
 * (quantized per the transition setting); on another song it loads + starts
 * at that part. The [+] affordance enqueues at the end; chips are draggable
 * into the queue (native DnD, mouse-first in the PoC).
 */
import { useState } from 'react';
import { Card, Chip, EmptyState } from '@laude/design-system';
import type { EngineState } from '@laude/laudj-control-protocol';
import { useT } from '@laude/i18n/react';
import { engine, isFallbackUsed } from '../engine';
import { useSongs } from '../hooks';
import { PART_DRAG_TYPE, type PartDragPayload } from './dnd';

export function SectionLauncher({ state }: { state: EngineState }) {
  const t = useT();
  const songs = useSongs();
  const { transport } = state;
  const [browsedId, setBrowsedId] = useState<string | null>(null);
  const songId = browsedId ?? transport.song_id ?? '';
  const song = songs.find((s) => s.song_id === songId) ?? null;
  const isLoaded = song !== null && song.song_id === transport.song_id;
  const sections = isLoaded ? transport.sections : (song?.sections ?? []);

  const launch = (index: number) => {
    if (!song) return;
    if (isLoaded) {
      engine.send({ type: 'launch_section', index });
    } else {
      engine.send({ type: 'load_song', song_id: song.song_id });
      engine.send({ type: 'seek', position_s: song.sections[index]?.start_s ?? 0 });
      engine.send({ type: 'play' });
    }
  };

  const partPayload = (index: number): PartDragPayload | null =>
    song
      ? {
          song_id: song.song_id,
          song_title: song.title,
          section_index: index,
          section_label: sections[index]?.label ?? `#${index + 1}`,
        }
      : null;

  const enqueue = (index: number) => {
    const part = partPayload(index);
    if (!part) return;
    engine.send({
      type: 'queue_add',
      entry: { ...part, repeats: 1, mods: { crescendo: false, solo: null, drop: false } },
    });
  };

  const dragStart = (index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    const part = partPayload(index);
    if (!part) return;
    e.dataTransfer.setData(PART_DRAG_TYPE, JSON.stringify(part));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <Card>
      <div className="ld-hstack">
        <span className="ld-label">{t('laudj.sections')}</span>
        {isFallbackUsed() && <Chip state="warn">{t('laudj.mockSongs')}</Chip>}
        <span className="ld-spacer" />
        <select
          className="ld-select"
          value={songId}
          onChange={(e) => setBrowsedId(e.target.value || null)}
        >
          <option value="" disabled>
            {t('session.pickSong')}
          </option>
          {songs.map((s) => (
            <option key={s.song_id} value={s.song_id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      {sections.length === 0 ? (
        <EmptyState>{t('common.empty')}</EmptyState>
      ) : (
        <div className="laudj-sections">
          {sections.map((section, index) => (
            <div
              key={`${index}-${section.label}`}
              className="laudj-part"
              draggable
              onDragStart={dragStart(index)}
            >
              <Chip
                state={
                  isLoaded && index === transport.current_section
                    ? 'current'
                    : isLoaded && index === transport.queued_section
                      ? 'queued'
                      : 'default'
                }
                onClick={() => launch(index)}
              >
                {section.label}
              </Chip>
              <button
                className="laudj-part__add"
                title={t('laudj.queue.add')}
                onClick={() => enqueue(index)}
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
