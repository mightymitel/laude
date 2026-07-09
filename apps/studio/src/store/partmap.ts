/**
 * Heuristic ONE-WAY mapping: timed DJ sections → work parts (DEC-43/56).
 * Computed at ingest from section labels vs the chart's part list; the
 * Studio editor refines it later (alignment unlocks driving, not linking).
 *
 * Emits WORK-PART REFS (label + ordinal, DEC-56) — never indices: the global
 * chart is a ChordPro blob with no stable part IDs. Sections that are
 * clearly lyric-less (intro/outro/instrumental) map to 'instrumental'
 * (a deliberate no-part, DEC-62); unrecognized labels map to null
 * (unaligned — no mapping row is written).
 */
import { renderChordPro } from '@laude/chords';
import type { WorkPartRef } from '@laude/song-model';

type PartKind = 'verse' | 'chorus' | 'bridge';

/** "Strofa 2" / "Verse 2" → (verse, 2) · "Refren" / "Chorus" → (chorus, 1) … */
export function classifyLabel(label: string): { kind: PartKind; n: number } | null {
  const lower = label.trim().toLowerCase();
  const number = /(\d+)/.exec(lower);
  const n = number ? Number(number[1]) : 1;
  if (/(chorus|refren)/.test(lower)) return { kind: 'chorus', n };
  if (/(bridge|punte)/.test(lower)) return { kind: 'bridge', n };
  if (/(verse|strofa|vers)/.test(lower)) return { kind: 'verse', n };
  return null;
}

/** Intro / Outro / Instrumental / Interlude — deliberately no work part. */
export function isInstrumentalLabel(label: string): boolean {
  return /(intro|outro|instrumental|interlud)/i.test(label.trim());
}

export type SectionPartTarget = WorkPartRef | 'instrumental' | null;

/**
 * Map each timed-section label onto a work-part ref from the chart. Repeated
 * choruses in time all map to the single chorus part.
 */
export function mapSectionsToPartRefs(labels: string[], chordpro: string): SectionPartTarget[] {
  let partsByKindOcc: Map<string, WorkPartRef>;
  try {
    const rendered = renderChordPro(chordpro);
    const kindCounters = new Map<PartKind, number>();
    const labelCounters = new Map<string, number>();
    partsByKindOcc = new Map();
    for (const section of rendered.sections) {
      const kind: PartKind =
        section.type === 'chorus' ? 'chorus' : section.type === 'bridge' ? 'bridge' : 'verse';
      const occurrence = (kindCounters.get(kind) ?? 0) + 1;
      kindCounters.set(kind, occurrence);
      const ordinal = (labelCounters.get(section.label) ?? 0) + 1;
      labelCounters.set(section.label, ordinal);
      partsByKindOcc.set(`${kind}:${occurrence}`, { label: section.label, ordinal });
    }
  } catch {
    partsByKindOcc = new Map();
  }

  return labels.map((label) => {
    if (isInstrumentalLabel(label)) return 'instrumental';
    const classified = classifyLabel(label);
    if (!classified) return null;
    return (
      partsByKindOcc.get(`${classified.kind}:${classified.n}`) ??
      // Repeated sections beyond the chart's count reuse occurrence 1
      // (choruses repeat in time but exist once in the work).
      partsByKindOcc.get(`${classified.kind}:1`) ??
      null
    );
  });
}
