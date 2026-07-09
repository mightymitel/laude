/**
 * Adapter: LaudStudio degree charts (chordpro) ↔ Laudasist's Song shape, so
 * the Studio editor page reuses THE SAME chart editor component (WP-104 /
 * DEC-68: "the chart editor is the same component as Laudasist's, operating
 * on degrees + reference key" — not a reimplementation).
 */
import { renderChordPro } from '@laude/chords';
import type { Arrangement, PartType, Song, SongPart } from '@laudasist/shared';
import { asKey } from '@/lib/keys';

export interface StudioSongDetail {
  local_song_id: string;
  global_song_id: string | null;
  link_state: 'local' | 'linked';
  title: string;
  language: string;
  chordpro: string;
  chart_source: 'derived' | 'snapshot';
  analysis_key: string;
  verified: boolean;
}

/** Degree chart → an editable Song (parts carry nashville tokens inline). */
export function chartToSong(detail: StudioSongDetail): Song {
  const rendered = renderChordPro(detail.chordpro, { notation: 'nashville' });
  const counters = new Map<PartType, number>();
  const parts: SongPart[] = rendered.sections.map((section, index) => {
    const type: PartType = section.type === 'chorus' ? 'chorus' : section.type === 'bridge' ? 'bridge' : 'verse';
    const n = (counters.get(type) ?? 0) + 1;
    counters.set(type, n);
    return {
      id: `${type === 'chorus' ? 'C' : type === 'bridge' ? 'B' : 'V'}${n}`,
      type,
      index,
      lines: section.lines.map((line) => ({
        text: line.items
          .map((item) => (item.chord ? `[${item.chord}]${item.lyrics}` : item.lyrics))
          .join(''),
      })),
    };
  });
  const order = parts.map((p) => p.id);
  const arrangements: Arrangement[] = [{ id: 'arr-default', name: 'Standard', order, isDefault: true }];
  const now = new Date();
  return {
    id: detail.local_song_id,
    title: detail.title,
    defaultKey: asKey(detail.analysis_key),
    defaultArrangement: order,
    arrangements,
    parts,
    tags: [],
    libraryType: 'user',
    ownerId: 'studio-local',
    visibility: 'private',
    createdAt: now,
    updatedAt: now,
    createdBy: 'studio-local',
  };
}

const DIRECTIVE_FOR: Record<PartType, [string, string]> = {
  verse: ['start_of_verse', 'end_of_verse'],
  chorus: ['start_of_chorus', 'end_of_chorus'],
  bridge: ['start_of_bridge', 'end_of_bridge'],
  'pre-chorus': ['start_of_verse', 'end_of_verse'],
  intro: ['start_of_verse', 'end_of_verse'],
  outro: ['start_of_verse', 'end_of_verse'],
  tag: ['start_of_verse', 'end_of_verse'],
};

/** Edited Song → degree chart (head {key:} = the analysis key). */
export function songToChart(song: Song, analysisKey: string, title: string): string {
  const out: string[] = [`{title: ${title}}`, `{key: ${analysisKey}}`];
  const counters = new Map<PartType, number>();
  for (const part of song.parts) {
    const n = (counters.get(part.type) ?? 0) + 1;
    counters.set(part.type, n);
    const [open, close] = DIRECTIVE_FOR[part.type] ?? DIRECTIVE_FOR.verse;
    const label = `${part.type === 'chorus' ? 'Chorus' : part.type === 'bridge' ? 'Bridge' : 'Verse'}${part.type === 'verse' ? ` ${n}` : ''}`;
    out.push('', `{${open}: ${label}}`);
    for (const line of part.lines) out.push(line.text);
    out.push(`{${close}}`);
  }
  return out.join('\n') + '\n';
}
