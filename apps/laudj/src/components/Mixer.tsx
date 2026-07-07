import { Button, Card, Fader, Meter } from '@laude/design-system';
import type { EngineState, StemChannelState } from '@laude/laudj-control-protocol';
import { useT } from '@laude/i18n/react';
import { engine } from '../engine';
import { STEM_KEYS } from '../labels';

function ChannelStrip({ channel }: { channel: StemChannelState }) {
  const t = useT();
  return (
    <div className="laudj-strip">
      <div className="laudj-strip__io">
        <Fader
          value={channel.gain}
          onChange={(gain) => engine.send({ type: 'set_stem_gain', stem: channel.stem, gain })}
          label={t(STEM_KEYS[channel.stem])}
          muted={channel.muted}
        />
        <Meter level={channel.meter} />
      </div>
      <div className="ld-hstack" style={{ gap: 4 }}>
        <Button
          active={channel.muted}
          onClick={() =>
            engine.send({ type: 'set_stem_muted', stem: channel.stem, muted: !channel.muted })
          }
        >
          {t('laudj.mute')}
        </Button>
        <Button
          active={channel.soloed}
          onClick={() =>
            engine.send({ type: 'set_stem_soloed', stem: channel.stem, soloed: !channel.soloed })
          }
        >
          {t('laudj.solo')}
        </Button>
      </div>
    </div>
  );
}

export function Mixer({ state }: { state: EngineState }) {
  const t = useT();
  return (
    <Card>
      <div className="ld-label">{t('laudj.mixer')}</div>
      <div className="laudj-mixer">
        {state.stems.map((channel) => (
          <ChannelStrip key={channel.stem} channel={channel} />
        ))}
        <div className="laudj-strip laudj-strip--master">
          <Fader
            value={state.master}
            onChange={(gain) => engine.send({ type: 'set_master', gain })}
            label={t('laudj.master')}
          />
        </div>
      </div>
    </Card>
  );
}
