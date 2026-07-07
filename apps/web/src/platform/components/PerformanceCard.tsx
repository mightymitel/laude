/** One recorded performance: service link, key/bpm, verified + stems chips. */
import type { ReactNode } from 'react';
import type { Performance, Service, StemName } from '@laude/song-model';
import { Card, Chip } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { youtubeUrl } from '../utils';

export function PerformanceCard(props: {
  perf: Performance;
  service: Service | undefined;
  promoted: boolean;
  action?: ReactNode;
}) {
  const t = useT();
  const { perf, service } = props;
  const stemLabels: Record<StemName, string> = {
    vocals: t('laudj.stem.vocals'),
    bass: t('laudj.stem.bass'),
    drums: t('laudj.stem.drums'),
    other: t('laudj.stem.other'),
  };

  return (
    <Card>
      <div className="ld-vstack">
        <div className="ld-hstack">
          <a href={youtubeUrl(perf.youtube_id, perf.start_s)} target="_blank" rel="noreferrer">
            {service !== undefined
              ? `${service.title}${service.date !== '' ? ` — ${service.date}` : ''}`
              : t('curation.service')}
          </a>
          {props.promoted && <Chip state="current">{t('song.performance.promoted')}</Chip>}
          <span className="ld-spacer" />
          {props.action}
        </div>
        <div className="ld-hstack">
          <Chip>
            {t('common.key')}: {perf.key}
          </Chip>
          <Chip>
            {perf.bpm} {t('song.bpm')}
          </Chip>
          <Chip state={perf.verified ? 'default' : 'warn'}>
            {perf.verified ? t('common.verified') : t('common.unverified')}
          </Chip>
          {perf.stems.length > 0 && <span className="ld-label">{t('song.stems')}</span>}
          {perf.stems.map((stem) => (
            <Chip key={stem}>{stemLabels[stem]}</Chip>
          ))}
        </div>
      </div>
    </Card>
  );
}
