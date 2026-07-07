import { Button } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { engine } from './engine';
import { useEngineState } from './hooks';
import { Mixer } from './components/Mixer';
import { PadsPanel } from './components/PadsPanel';
import { QueuePanel } from './components/QueuePanel';
import { SectionLauncher } from './components/SectionLauncher';
import { SessionStrip } from './components/SessionStrip';
import { TopBar } from './components/TopBar';
import { Transport } from './components/Transport';

export default function App() {
  const t = useT();
  const state = useEngineState();

  if (!state) {
    return (
      <div className="ld-stage laudj-root">
        <div className="ld-page">{t('common.loading')}</div>
      </div>
    );
  }

  const padsOnly = state.mode === 'pads_only';

  return (
    <div className="ld-stage laudj-root">
      <TopBar state={state} />
      {state.yielded && (
        <div className="laudj-yield">
          <span>{t('laudj.yielded')}</span>
          <Button variant="primary" onClick={() => engine.send({ type: 'resume_auto_advance' })}>
            {t('laudj.resume')}
          </Button>
        </div>
      )}
      <main className="ld-page laudj-main">
        {!padsOnly && <Transport state={state} />}
        <div className="laudj-columns">
          {!padsOnly && <Mixer state={state} />}
          <div className="ld-vstack" style={{ flex: 1, minWidth: 320 }}>
            {!padsOnly && <SectionLauncher state={state} />}
            {!padsOnly && <QueuePanel state={state} />}
            <PadsPanel state={state} />
          </div>
        </div>
      </main>
      <SessionStrip state={state} />
    </div>
  );
}
