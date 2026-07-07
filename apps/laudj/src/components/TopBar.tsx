import { useState } from 'react';
import { Button, Segmented, StatusDot, Toggle } from '@laude/design-system';
import type { EngineState } from '@laude/laudj-control-protocol';
import { useT } from '@laude/i18n/react';
import { engine } from '../engine';
import { PairOverlay } from './PairOverlay';

export function TopBar({ state }: { state: EngineState }) {
  const t = useT();
  const [pairOpen, setPairOpen] = useState(false);

  return (
    <header className="ld-topbar">
      <strong>{t('laudj.title')}</strong>
      <span className="ld-hstack">
        <StatusDot on={engine.connected} />
        <span className="ld-label">
          {engine.connected ? t('laudj.connected') : t('laudj.disconnected')}
        </span>
      </span>
      <Button onClick={() => setPairOpen(true)}>{t('laudj.pair')}</Button>
      <span className="ld-spacer" />
      <Segmented
        options={[
          { id: 'pads_only', label: t('laudj.mode.padsOnly') },
          { id: 'full_engine', label: t('laudj.mode.fullEngine') },
        ]}
        value={state.mode}
        onChange={(mode) => engine.send({ type: 'set_mode', mode })}
      />
      <Toggle
        on={state.auto_advance}
        onChange={(enabled) => engine.send({ type: 'set_auto_advance', enabled })}
        label={t('laudj.autoAdvance')}
      />
      {pairOpen && <PairOverlay onClose={() => setPairOpen(false)} />}
    </header>
  );
}
