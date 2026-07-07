/** Companion directives (tier 2) editor: pad style/volume + interlude. */
import type { CompanionDirectives } from '@laude/song-model';
import { Segmented, Toggle } from '@laude/design-system';
import { useT } from '@laude/i18n/react';

const PAD_STYLES = ['warm', 'bright', 'shimmer', 'deep'] as const;
type PadStyle = (typeof PAD_STYLES)[number];

function padStyleOf(value: string): PadStyle {
  return PAD_STYLES.find((s) => s === value) ?? 'warm';
}

export function CompanionPanel(props: {
  companion: CompanionDirectives;
  onPatch: (patch: Partial<CompanionDirectives>) => void;
}) {
  const t = useT();
  const labels: Record<PadStyle, string> = {
    warm: t('pad.style.warm'),
    bright: t('pad.style.bright'),
    shimmer: t('pad.style.shimmer'),
    deep: t('pad.style.deep'),
  };

  return (
    <div className="ld-vstack">
      <span className="ld-label">{t('session.companion')}</span>
      <div className="ld-hstack">
        <span className="ld-label">{t('session.pads_on')}</span>
        <Toggle
          on={props.companion.pads_on}
          onChange={(on) => props.onPatch({ pads_on: on })}
          label={props.companion.pads_on ? t('common.on') : t('common.off')}
        />
      </div>
      <div className="ld-hstack">
        <span className="ld-label">{t('session.pad.style')}</span>
        <Segmented
          options={PAD_STYLES.map((s) => ({ id: s, label: labels[s] }))}
          value={padStyleOf(props.companion.pad_style)}
          onChange={(style) => props.onPatch({ pad_style: style })}
        />
      </div>
      <div className="ld-hstack">
        <span className="ld-label">{t('session.pad.volume')}</span>
        <input
          className="ld-input"
          type="range"
          min={0}
          max={100}
          value={Math.round(props.companion.pad_volume * 100)}
          onChange={(e) => props.onPatch({ pad_volume: Number(e.target.value) / 100 })}
        />
        <span className="ld-label">{Math.round(props.companion.pad_volume * 100)}%</span>
      </div>
      <div className="ld-hstack">
        <span className="ld-label">{t('session.pad.interlude')}</span>
        <Toggle
          on={props.companion.interlude}
          onChange={(on) => props.onPatch({ interlude: on })}
          label={props.companion.interlude ? t('common.on') : t('common.off')}
        />
      </div>
    </div>
  );
}
