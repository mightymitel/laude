/**
 * Heuristic ONE-WAY mapping: timed DJ sections → work parts (DEC-43).
 * Computed at ingest from section labels vs the chart's section order;
 * the Studio editor refines it later (alignment is what unlocks driving,
 * not what makes linking work). Unmapped sections stay null — the DJ then
 * drives audio through them without announcing a part.
 */
import { renderChordPro } from '@laude/chords';

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

/**
 * Map each timed-section label onto an index into the WORK's part order
 * (the chart's section order — the same order Laudasist's arrangement uses).
 * Repeated choruses in time all map to the single chorus part.
 */
export function mapSectionsToParts(labels: string[], chordpro: string): (number | null)[] {
  let partsByKindOcc: Map<string, number>;
  try {
    const rendered = renderChordPro(chordpro);
    const counters = new Map<PartKind, number>();
    partsByKindOcc = new Map();
    rendered.sections.forEach((section, index) => {
      const kind: PartKind = section.type === 'chorus' ? 'chorus' : section.type === 'bridge' ? 'bridge' : 'verse';
      const occurrence = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, occurrence);
      partsByKindOcc.set(`${kind}:${occurrence}`, index);
    });
  } catch {
    return labels.map(() => null);
  }

  return labels.map((label) => {
    const classified = classifyLabel(label);
    if (!classified) return null;
    return (
      partsByKindOcc.get(`${classified.kind}:${classified.n}`) ??
      partsByKindOcc.get(`${classified.kind}:1`) ??
      null
    );
  });
}
