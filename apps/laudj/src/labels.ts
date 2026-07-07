/** i18n key lookups for enum-ish values (keeps t() calls type-safe). */
import type { MessageKey } from '@laude/i18n';
import type { PadStyle } from '@laude/pad-engine';
import type { StemName } from '@laude/song-model';

export const STEM_KEYS: Record<StemName, MessageKey> = {
  vocals: 'laudj.stem.vocals',
  bass: 'laudj.stem.bass',
  drums: 'laudj.stem.drums',
  other: 'laudj.stem.other',
};

export const PAD_STYLE_KEYS: Record<PadStyle, MessageKey> = {
  warm: 'laudj.padstyle.warm',
  bright: 'laudj.padstyle.bright',
  shimmer: 'laudj.padstyle.shimmer',
  deep: 'laudj.padstyle.deep',
};

/** "G (+2)" style key display. */
export function keyDisplay(key: string | null, variant: number): string {
  if (!key) return '—';
  if (variant === 0) return key;
  return `${key} (${variant > 0 ? '+' : ''}${variant})`;
}

/** mm:ss */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}
