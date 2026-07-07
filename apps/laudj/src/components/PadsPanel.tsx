import { Button, Card, Fader, Segmented, Toggle } from '@laude/design-system';
import type { EngineState } from '@laude/laudj-control-protocol';
import { PAD_STYLES, type PadStyle } from '@laude/pad-engine';
import { useT } from '@laude/i18n/react';
import { padsController } from '../pads-controller';
import { usePadState } from '../hooks';
import { PAD_STYLE_KEYS } from '../labels';

export function PadsPanel({ state }: { state: EngineState }) {
  const t = useT();
  const localPad = usePadState();
  const { pads, transport } = state;
  const key = transport.key ?? 'C';

  const toggleRunning = () => {
    if (pads.running) padsController.stop();
    else padsController.start(key);
  };

  const setStyle = (style: PadStyle) => padsController.setStyle(style);
  const setVolume = (volume: number) => padsController.setVolume(volume);
  const setInterlude = (on: boolean) => {
    void padsController.setInterlude(on, transport.song_id, key);
  };

  return (
    <Card>
      <div className="ld-label">{t('laudj.pads')}</div>
      <div className="ld-hstack" style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <div className="ld-vstack" style={{ flex: 1, minWidth: 220 }}>
          <Button big variant="primary" active={pads.running} onClick={toggleRunning}>
            {pads.running ? t('laudj.pad.stop') : t('laudj.pad.start')}
          </Button>
          <span className="ld-vstack laudj-control">
            <span className="ld-label">{t('laudj.pad.style')}</span>
            <Segmented<PadStyle>
              options={PAD_STYLES.map((style) => ({ id: style, label: t(PAD_STYLE_KEYS[style]) }))}
              value={pads.style}
              onChange={setStyle}
            />
          </span>
          <Toggle on={pads.interlude} onChange={setInterlude} label={t('laudj.pad.interlude')} />
        </div>
        <Fader value={pads.volume} onChange={setVolume} label={t('laudj.pad.volume')} />
        <div className="ld-vstack" style={{ alignItems: 'center' }}>
          <span className="ld-label">{t('laudj.pad.chord')}</span>
          <div className="laudj-chord">{localPad.chord ?? '—'}</div>
        </div>
      </div>
    </Card>
  );
}
