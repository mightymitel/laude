/**
 * Embedded-parts → degree-chart ChordPro builder (DEC-46): the inverse of
 * rendering a chart into parts with inline `[token]` brackets. Used wherever
 * a parts-shaped editor/import surface persists into the global storage
 * format (chordpro with a head `{key:}` reference).
 */

export interface ChordProPart {
  /** verse / chorus / bridge / pre-chorus / intro / outro / tag … */
  type: string;
  lines: { text: string }[];
}

const DIRECTIVE_FOR: Record<string, [string, string]> = {
  verse: ['start_of_verse', 'end_of_verse'],
  chorus: ['start_of_chorus', 'end_of_chorus'],
  bridge: ['start_of_bridge', 'end_of_bridge'],
};

function labelFor(type: string, ordinal: number): string {
  if (type === 'chorus') return 'Chorus';
  if (type === 'bridge') return 'Bridge';
  if (type === 'verse') return `Verse ${ordinal}`;
  // Non-core types keep their name visible in the label ("Pre-chorus 1").
  const pretty = type.charAt(0).toUpperCase() + type.slice(1);
  return `${pretty} ${ordinal}`;
}

/**
 * Build a chordpro chart from parts whose lines carry inline bracket tokens.
 * The head `{key:}` is the reference key the tokens were written against.
 * Types without a ChordPro section directive of their own render as verse
 * sections with a typed label — lossy on the type, lossless on content.
 */
export function partsToChordPro(parts: ChordProPart[], key: string, title?: string): string {
  const out: string[] = [];
  // Directive values cannot span lines or carry unescaped braces — a messy
  // title (scraped markup, typos) must degrade, not corrupt the chart.
  const safeTitle = title?.replace(/\s+/g, ' ').replace(/[{}\\]/g, '').trim();
  if (safeTitle !== undefined && safeTitle !== '') out.push(`{title: ${safeTitle}}`);
  out.push(`{key: ${key}}`);
  const counters = new Map<string, number>();
  for (const part of parts) {
    const n = (counters.get(part.type) ?? 0) + 1;
    counters.set(part.type, n);
    const [open, close] = DIRECTIVE_FOR[part.type] ?? DIRECTIVE_FOR['verse']!;
    out.push('', `{${open}: ${labelFor(part.type, n)}}`);
    for (const line of part.lines) out.push(line.text);
    out.push(`{${close}}`);
  }
  return out.join('\n') + '\n';
}
