/**
 * The viewport rendering contract — VERSIONED (ticket 87 / DEC-40/41).
 * Two halves, both stable: PLACEHOLDERS (what a viewport reads from by-value
 * session state) and the DECLARED CLASS (which broadcast directives it
 * obeys). Custom authored templates (a restricted, validated language) build
 * on this same contract later — presets are code, not data.
 *
 * v1 placeholder vocabulary (resolved from session state, omit-if-empty):
 *   {{song_title}}   currentSong.title
 *   {{song_author}}  currentSong.author
 *   {{key}}          current.key ?? currentSong.defaultKey
 *   {{section_name}} currentSong.parts[current.section_index].type
 *   {{lyrics}}       current part lines, chords stripped
 *   {{chords}}       current part chord line, device notation
 *   {{next_part}}    the part after the current one (label + first lines)
 *   {{message}}      the directive message for the viewport's class
 *
 * Directives (per class, STATE not events — late joiners inherit them):
 *   blank · freeze · message
 */
export const VIEWPORT_CONTRACT_VERSION = 1;

/** The four preset classes. The directive map is open (string keys) so
 * authored templates can declare new classes without a contract bump. */
export const VIEWPORT_CLASSES = ['main', 'stage', 'instrument', 'subtitles'] as const;
export type ViewportClass = (typeof VIEWPORT_CLASSES)[number];

export function asViewportClass(value: string | undefined): ViewportClass {
  // Legacy alias from the pre-contract viewer page.
  if (value === 'audience') return 'main';
  return (VIEWPORT_CLASSES as readonly string[]).includes(value ?? '')
    ? (value as ViewportClass)
    : 'main';
}

/** Style options every preset exposes (per-device, localStorage — DEC-42). */
export interface ViewportStyleOptions {
  /** Chord notation id from the @laude/chords registry. */
  notation: string;
  showChords: boolean;
  /** rem multiplier applied to the preset's base size. */
  fontScale: number;
  background: 'dark' | 'light' | 'transparent';
}
