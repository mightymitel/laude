/**
 * Vertical dynamic part queue: drop target for palette parts, reorderable
 * rows (native DnD — mouse-first in the PoC; every action also has a button),
 * per-entry quick options (repeats ×1..8, crescendo, solo cycle, drop),
 * play-now, and the big "Start queue" that engages the engine on the head.
 */
import { Button, Card, EmptyState, Stepper } from '@laude/design-system';
import type { ActiveQueueEntry, EngineState, QueueEntry } from '@laude/laudj-control-protocol';
import { ALL_STEMS, type StemName } from '@laude/song-model';
import { useT } from '@laude/i18n/react';
import { engine } from '../engine';
import { STEM_KEYS } from '../labels';
import { QUEUE_DRAG_TYPE, readPartPayload, readQueueDragId } from './dnd';

const SOLO_CYCLE: (StemName | null)[] = [null, ...ALL_STEMS];

function nextSolo(current: StemName | null): StemName | null {
  const index = SOLO_CYCLE.indexOf(current);
  return SOLO_CYCLE[(index + 1) % SOLO_CYCLE.length] ?? null;
}

type DropAt = (e: React.DragEvent<HTMLElement>, index: number) => void;

function CurrentRow({ entry }: { entry: ActiveQueueEntry }) {
  const t = useT();
  return (
    <div className="laudj-queue__row laudj-queue__row--current">
      <span className="ld-label">{t('laudj.queue.nowPlaying')}</span>
      <strong>{entry.section_label}</strong>
      <span className="laudj-queue__song">{entry.song_title}</span>
      <span className="ld-spacer" />
      <span className="laudj-queue__pass">
        {entry.repeats - entry.repeats_left + 1}/{entry.repeats}
      </span>
    </div>
  );
}

function QueueRow(props: {
  entry: QueueEntry;
  index: number;
  loadedSongId: string | null;
  onDropAt: DropAt;
}) {
  const t = useT();
  const { entry, index, loadedSongId, onDropAt } = props;
  const update = (patch: Partial<Pick<QueueEntry, 'repeats' | 'mods'>>) =>
    engine.send({ type: 'queue_update', id: entry.id, patch });
  const setRepeats = (delta: number) =>
    update({ repeats: Math.max(1, Math.min(8, entry.repeats + delta)) });
  const soloLabel =
    entry.mods.solo === null
      ? t('laudj.queue.solo.none')
      : t('laudj.queue.solo.stem', { stem: t(STEM_KEYS[entry.mods.solo]) });

  return (
    <div
      className="laudj-queue__row"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(QUEUE_DRAG_TYPE, entry.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDropAt(e, index)}
    >
      <span className="laudj-queue__handle" title={t('laudj.queue.dragHint')}>
        ≡
      </span>
      <span className="laudj-queue__label">
        <strong>{entry.section_label}</strong>
        {entry.song_id !== loadedSongId && (
          <span className="laudj-queue__song">{entry.song_title}</span>
        )}
      </span>
      <Stepper
        value={`×${entry.repeats}`}
        onDecrement={() => setRepeats(-1)}
        onIncrement={() => setRepeats(1)}
      />
      <Button
        active={entry.mods.crescendo}
        onClick={() => update({ mods: { ...entry.mods, crescendo: !entry.mods.crescendo } })}
      >
        {t('laudj.queue.crescendo')}
      </Button>
      <Button
        active={entry.mods.solo !== null}
        onClick={() => update({ mods: { ...entry.mods, solo: nextSolo(entry.mods.solo) } })}
      >
        {soloLabel}
      </Button>
      <Button
        active={entry.mods.drop}
        onClick={() => update({ mods: { ...entry.mods, drop: !entry.mods.drop } })}
      >
        {t('laudj.queue.drop')}
      </Button>
      <Button
        variant="primary"
        title={t('laudj.queue.playNow')}
        onClick={() => engine.send({ type: 'queue_play_now', id: entry.id })}
      >
        ▶
      </Button>
      <Button
        variant="ghost"
        title={t('laudj.queue.remove')}
        onClick={() => engine.send({ type: 'queue_remove', id: entry.id })}
      >
        ✕
      </Button>
    </div>
  );
}

export function QueuePanel({ state }: { state: EngineState }) {
  const t = useT();
  const { queue, queue_current: current, transport } = state;
  const head = queue[0];

  const dropAt: DropAt = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    const part = readPartPayload(e.dataTransfer);
    if (part) {
      engine.send({
        type: 'queue_add',
        entry: { ...part, repeats: 1, mods: { crescendo: false, solo: null, drop: false } },
        at: index,
      });
      return;
    }
    const id = readQueueDragId(e.dataTransfer);
    if (id) engine.send({ type: 'queue_move', id, to: index });
  };

  return (
    <Card>
      <div className="ld-hstack">
        <span className="ld-label">{t('laudj.queue')}</span>
        <span className="ld-spacer" />
        {current === null && head !== undefined && (
          <Button
            big
            variant="primary"
            onClick={() => engine.send({ type: 'queue_play_now', id: head.id })}
          >
            {t('laudj.queue.start')}
          </Button>
        )}
        {queue.length > 0 && (
          <Button variant="ghost" onClick={() => engine.send({ type: 'queue_clear' })}>
            {t('laudj.queue.clear')}
          </Button>
        )}
      </div>
      {current !== null && <CurrentRow entry={current} />}
      <div
        className="laudj-queue"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => dropAt(e, queue.length)}
      >
        {queue.length === 0 ? (
          current === null && <EmptyState>{t('laudj.queue.empty')}</EmptyState>
        ) : (
          queue.map((entry, index) => (
            <QueueRow
              key={entry.id}
              entry={entry}
              index={index}
              loadedSongId={transport.song_id}
              onDropAt={dropAt}
            />
          ))
        )}
      </div>
    </Card>
  );
}
