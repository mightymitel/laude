/** Small pure helpers shared by the platform wireframe views. */
import type { SongLink } from '@laude/song-model';

/** ChordPro → plain lyric text (directives and inline chords removed) for client-side search. */
export function stripChordPro(chordpro: string): string {
  return chordpro.replace(/\{[^}]*\}/g, ' ').replace(/\[[^\]]*\]/g, '');
}

/** Seconds → "m:ss" for the mock karaoke transport. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Bidirectional song → translated-song map from the song_links relation. */
export function translationMap(links: SongLink[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const link of links) {
    if (link.relation_type !== 'translation') continue;
    if (link.song_id === '' || link.related_song_id === '') continue;
    if (!map.has(link.song_id)) map.set(link.song_id, link.related_song_id);
    if (!map.has(link.related_song_id)) map.set(link.related_song_id, link.song_id);
  }
  return map;
}

/** YouTube deep link for a performance/service segment. */
export function youtubeUrl(youtubeId: string, startS?: number): string {
  const base = `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
  return startS !== undefined && startS > 0 ? `${base}&t=${Math.floor(startS)}s` : base;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
