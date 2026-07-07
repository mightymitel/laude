/**
 * Typed mappers from loose Firestore DocumentData to the @laude/song-model
 * contract types. Field-by-field with honest fallbacks — the wireframe must
 * survive partial or missing data while the seeder is still running.
 */
import type { DocumentData } from 'firebase/firestore';
import {
  ALL_STEMS,
  type Lang,
  type LrcLine,
  type Performance,
  type Service,
  type SessionCurrent,
  type Song,
  type SongLink,
  type SongLyrics,
  type StemName,
} from '@laude/song-model';

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function numList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function langOf(v: unknown): Lang {
  return v === 'en' ? 'en' : 'ro';
}

function stemList(v: unknown): StemName[] {
  const names = strList(v);
  return ALL_STEMS.filter((s) => names.includes(s));
}

function lrcLines(v: unknown): LrcLine[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const lines: LrcLine[] = [];
  for (const item of v) {
    if (isRecord(item) && typeof item.time_s === 'number' && typeof item.text === 'string') {
      lines.push({ time_s: item.time_s, text: item.text });
    }
  }
  return lines.length > 0 ? lines : undefined;
}

export function songFromDoc(id: string, d: DocumentData): Song {
  return {
    id,
    canonical_title: str(d.canonical_title, str(d.title)),
    original_key: str(d.original_key, 'C'),
    default_bpm: num(d.default_bpm),
    language: langOf(d.language),
    ccli_number: optStr(d.ccli_number),
    tags: strList(d.tags),
    preferred_performance_id: optStr(d.preferred_performance_id),
    verified: bool(d.verified),
    created_at: str(d.created_at),
  };
}

export function lyricsFromDoc(_id: string, d: DocumentData): SongLyrics {
  return {
    song_id: str(d.song_id),
    lang: langOf(d.lang),
    chordpro: str(d.chordpro),
    lrc: lrcLines(d.lrc),
    verified: bool(d.verified),
  };
}

export function linkFromDoc(_id: string, d: DocumentData): SongLink {
  const rel = d.relation_type;
  return {
    song_id: str(d.song_id),
    related_song_id: str(d.related_song_id),
    relation_type: rel === 'medley' || rel === 'alternate_arrangement' ? rel : 'translation',
  };
}

export function performanceFromDoc(id: string, d: DocumentData): Performance {
  return {
    id,
    song_id: str(d.song_id),
    service_id: str(d.service_id),
    youtube_id: str(d.youtube_id),
    start_s: num(d.start_s),
    end_s: num(d.end_s),
    key: str(d.key),
    bpm: num(d.bpm),
    verified: bool(d.verified),
    stems: stemList(d.stems),
    key_variants: numList(d.key_variants),
  };
}

export function serviceFromDoc(id: string, d: DocumentData): Service {
  return {
    id,
    date: str(d.date),
    title: str(d.title),
    youtube_id: str(d.youtube_id),
  };
}

/** The slice of a live-session doc the read-only views (stage) need. */
export function sessionCurrentFromDoc(d: DocumentData): SessionCurrent {
  const c: Record<string, unknown> = isRecord(d.current) ? d.current : {};
  return {
    song_id: typeof c.song_id === 'string' && c.song_id !== '' ? c.song_id : null,
    section_index: num(c.section_index),
    key: typeof c.key === 'string' && c.key !== '' ? c.key : null,
    tempo_pct: num(c.tempo_pct, 100),
    blank: bool(c.blank),
  };
}
