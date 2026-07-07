/** Pure playback-math helpers, extracted so they are unit-testable without Web Audio. */

/** First beat time strictly after `position` (seconds), or null when none is left. */
export function nextBeatAfter(beats: number[], position: number): number | null {
  let lo = 0;
  let hi = beats.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] > position) hi = mid;
    else lo = mid + 1;
  }
  const beat = beats[lo];
  return typeof beat === 'number' ? beat : null;
}

/** Clamp a requested semitone offset to the performance's available variants (0 = original, always allowed). */
export function clampToVariants(semitones: number, variants: number[]): number {
  if (variants.length === 0) return 0;
  const min = Math.min(...variants, 0);
  const max = Math.max(...variants, 0);
  return Math.min(max, Math.max(min, semitones));
}
