/**
 * Importer part dedupe (WP-174 / DEC-149). Import is an on-ramp, not an
 * authority: when the same part is written out repeatedly in the source
 * text, store it ONCE and emit the inferred sequence as the STARTING
 * default arrangement (fully editable in the composer).
 *
 * GUARDRAIL: dedupe CONSERVATIVELY — EXACT matches only (same type, same
 * lines, verbatim). A chorus with one word changed or a modulated final
 * chorus stays a separate part: false-merging silently destroys a lyric
 * variant the user can't see, while two visible near-duplicates are
 * trivially merged in an editor with full control. Bias to under-merging.
 */
import type { SongPart } from '../shared/index.js';

const TYPE_LETTER: Record<string, string> = {
    verse: 'V',
    chorus: 'C',
    bridge: 'B',
    'pre-chorus': 'P',
    intro: 'I',
    outro: 'O',
    tag: 'T',
};

function signatureOf(part: SongPart): string {
    // Verbatim line texts — chord tokens included. Exact or nothing.
    return `${part.type}|${part.lines.map((l) => l.text).join('\n')}`;
}

export interface DedupedImport {
    parts: SongPart[];
    /** Present ONLY when a repeat was actually merged. */
    defaultArrangement?: string[];
}

export function dedupeRepeatedParts(parts: SongPart[]): DedupedImport {
    const keptBySignature = new Map<string, number>(); // signature → kept parts index
    const kept: SongPart[] = [];
    const refs: string[] = [];
    const typeCounts = new Map<string, number>();
    let merged = false;

    for (const part of parts) {
        const sig = signatureOf(part);
        const existing = keptBySignature.get(sig);
        if (existing !== undefined) {
            merged = true;
            refs.push(refOf(kept[existing]!));
            continue;
        }
        const n = (typeCounts.get(part.type) ?? 0) + 1;
        typeCounts.set(part.type, n);
        // Renumber per type in kept order so refs are unambiguous.
        const renumbered: SongPart = { ...part, index: n };
        keptBySignature.set(sig, kept.length);
        kept.push(renumbered);
        refs.push(refOf(renumbered));
    }

    return merged ? { parts: kept, defaultArrangement: refs } : { parts };
}

function refOf(part: SongPart): string {
    return `${TYPE_LETTER[part.type] ?? 'V'}${part.index}`;
}
