/**
 * The four viewport PRESETS — code, not data (DEC-40). Each declares its
 * class (which directives it obeys), what it shows, and default style
 * options; per-device tweaks persist to localStorage.
 */
import {
  type ViewportClass,
  type ViewportStyleOptions,
} from './contract';

export interface ViewportPreset {
  class: ViewportClass;
  label: string;
  /** What the preset renders (drives the renderer). */
  shows: {
    chords: boolean;
    nextPart: boolean;
    /** Single-line minimal output (livestream overlay). */
    oneLine: boolean;
  };
  defaults: ViewportStyleOptions;
}

export const VIEWPORT_PRESETS: Record<ViewportClass, ViewportPreset> = {
  main: {
    class: 'main',
    label: '🎤 Main / Lyrics',
    shows: { chords: false, nextPart: false, oneLine: false },
    defaults: { notation: 'english', showChords: false, fontScale: 1, background: 'dark' },
  },
  stage: {
    class: 'stage',
    label: '🎸 Stage',
    shows: { chords: true, nextPart: true, oneLine: false },
    defaults: { notation: 'english', showChords: true, fontScale: 1, background: 'dark' },
  },
  instrument: {
    class: 'instrument',
    label: '🎹 Instrument',
    shows: { chords: true, nextPart: true, oneLine: false },
    defaults: { notation: 'english', showChords: true, fontScale: 1, background: 'dark' },
  },
  // Subtitles: the CLASS is registered (directives apply); the dedicated
  // authored renderer is deferred — the preset renders minimal one-line text.
  subtitles: {
    class: 'subtitles',
    label: '📺 Subtitles',
    shows: { chords: false, nextPart: false, oneLine: true },
    defaults: { notation: 'english', showChords: false, fontScale: 1, background: 'transparent' },
  },
};

const storageKey = (cls: ViewportClass) => `laudasist.viewport.${cls}`;

export function loadViewportOptions(cls: ViewportClass): ViewportStyleOptions {
  const defaults = VIEWPORT_PRESETS[cls].defaults;
  try {
    const raw = localStorage.getItem(storageKey(cls));
    if (raw === null) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    const p = parsed as Partial<ViewportStyleOptions>;
    return {
      notation: typeof p.notation === 'string' ? p.notation : defaults.notation,
      showChords: typeof p.showChords === 'boolean' ? p.showChords : defaults.showChords,
      fontScale: typeof p.fontScale === 'number' ? p.fontScale : defaults.fontScale,
      background:
        p.background === 'light' || p.background === 'transparent' || p.background === 'dark'
          ? p.background
          : defaults.background,
    };
  } catch {
    return defaults;
  }
}

export function saveViewportOptions(cls: ViewportClass, options: ViewportStyleOptions): void {
  localStorage.setItem(storageKey(cls), JSON.stringify(options));
}
