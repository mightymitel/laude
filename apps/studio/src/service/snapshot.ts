/**
 * Chart → snapshot_parts (WP-103, Local Schema spec). The snapshot is the
 * DRIFT DETECTOR, not a source of truth (DEC-56): (label, ordinal,
 * first_line) per work part plus a fingerprint of the whole part list.
 */
import { createHash } from 'node:crypto';
import { renderChordPro } from '@laude/chords';
import type { SnapshotParts } from '../store';

/** Lowercase, diacritics-free, chord-free text for fuzzy comparisons. */
export function normalizeLyric(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function chartSnapshotParts(chordpro: string): SnapshotParts {
  const rendered = renderChordPro(chordpro);
  const labelCounts = new Map<string, number>();
  const parts = rendered.sections.map((section) => {
    const ordinal = (labelCounts.get(section.label) ?? 0) + 1;
    labelCounts.set(section.label, ordinal);
    const firstLine = section.lines[0]?.items.map((i) => i.lyrics).join('') ?? '';
    return { label: section.label, ordinal, first_line: firstLine.trim() };
  });
  const fingerprint = createHash('sha1')
    .update(parts.map((p) => `${p.label}#${p.ordinal}:${normalizeLyric(p.first_line)}`).join('\n'))
    .digest('hex');
  return { parts, fingerprint };
}
