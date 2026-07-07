import { Button, Card, Segmented, Stepper } from '@laude/design-system';
import type { EngineState, TransitionType } from '@laude/laudj-control-protocol';
import { useT } from '@laude/i18n/react';
import { engine } from '../engine';
import { formatTime, keyDisplay } from '../labels';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function Transport({ state }: { state: EngineState }) {
  const t = useT();
  const { transport, transition } = state;

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (transport.duration_s <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    engine.send({ type: 'seek', position_s: fraction * transport.duration_s });
  };

  const setKeyVariant = (delta: number) =>
    engine.send({ type: 'set_key_variant', semitones: clamp(transport.key_variant + delta, -6, 6) });

  const setTempo = (delta: number) =>
    engine.send({ type: 'set_tempo_pct', tempo_pct: clamp(transport.tempo_pct + delta, 75, 125) });

  const setCrossfade = (delta: number) =>
    engine.send({
      type: 'set_transition',
      transition: transition.type,
      crossfade_s: clamp(transition.crossfade_s + delta, 0, 8),
    });

  const progress = transport.duration_s > 0 ? transport.position_s / transport.duration_s : 0;

  return (
    <Card>
      <div className="ld-label">{t('laudj.transport')}</div>
      <div className="ld-hstack" style={{ marginTop: 8 }}>
        <Button
          big
          variant="primary"
          onClick={() => engine.send({ type: transport.playing ? 'pause' : 'play' })}
        >
          {transport.playing ? t('laudj.pause') : t('laudj.play')}
        </Button>
        <div className="ld-vstack" style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <div className="ld-hstack">
            <strong>{transport.song_title ?? t('session.noSong')}</strong>
            <span className="ld-spacer" />
            <span className="laudj-time">
              {formatTime(transport.position_s)} / {formatTime(transport.duration_s)}
            </span>
          </div>
          <div className="laudj-progress" onClick={seek}>
            <div className="laudj-progress__fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="ld-hstack" style={{ marginTop: 12 }}>
        <span className="ld-vstack laudj-control">
          <span className="ld-label">{t('common.key')}</span>
          <Stepper
            value={keyDisplay(transport.key, transport.key_variant)}
            onDecrement={() => setKeyVariant(-1)}
            onIncrement={() => setKeyVariant(1)}
          />
        </span>
        <span className="ld-vstack laudj-control">
          <span className="ld-label">{t('common.tempo')}</span>
          <Stepper
            value={`${transport.tempo_pct}%`}
            onDecrement={() => setTempo(-5)}
            onIncrement={() => setTempo(5)}
          />
        </span>
        <span className="ld-spacer" />
        <span className="ld-vstack laudj-control">
          <span className="ld-label">{t('laudj.transition')}</span>
          <Segmented<TransitionType>
            options={[
              { id: 'immediate', label: t('laudj.transition.immediate') },
              { id: 'quantized', label: t('laudj.transition.quantized') },
              { id: 'queued', label: t('laudj.transition.queued') },
            ]}
            value={transition.type}
            onChange={(next) =>
              engine.send({ type: 'set_transition', transition: next, crossfade_s: transition.crossfade_s })
            }
          />
        </span>
        <span className="ld-vstack laudj-control">
          <span className="ld-label">{t('laudj.crossfade')}</span>
          <Stepper
            value={`${transition.crossfade_s}s`}
            onDecrement={() => setCrossfade(-1)}
            onIncrement={() => setCrossfade(1)}
          />
        </span>
      </div>
    </Card>
  );
}
