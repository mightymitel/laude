/**
 * LaudStudio local-first store: typed access over SQLite (better-sqlite3).
 * One shared store for LaudStudio + LauDJ (LauDJ reads it over the local
 * HTTP service — see src/service/). All writes go through this module.
 */
import Database from 'better-sqlite3';
import { relative } from 'node:path';
import type {
  ChordEvent,
  Lang,
  LocalCatalogSong,
  LocalPerformanceDetail,
  LrcLine,
  StemName,
} from '@laude/song-model';
import { ALL_STEMS } from '@laude/song-model';
import { DATA_DIR, DB_PATH, ensureDataDir } from './paths';
import { SCHEMA } from './schema';

export interface LocalSongRow {
  id: string;
  global_song_id: string | null;
  title: string;
  language: Lang;
  original_key: string;
  default_bpm: number;
  preferred_performance_id: string | null;
  verified: boolean;
  created_at: string;
}

export interface PerformanceRow {
  id: string;
  local_song_id: string;
  service_id: string | null;
  youtube_id: string | null;
  start_s: number;
  end_s: number;
  key: string;
  bpm: number;
  chordpro: string;
  lrc: LrcLine[];
  verified: boolean;
  created_at: string;
}

export interface SectionRow {
  label: string;
  start_s: number;
  end_s: number;
  start_bar: number;
  end_bar: number;
}

export interface ServiceRow {
  id: string;
  date: string;
  title: string;
  youtube_id: string;
}

export interface SegmentRow {
  id: string;
  service_id: string;
  type: string;
  start_s: number;
  end_s: number;
  local_song_id: string | null;
}

export type AudioKind = 'stem' | 'variant' | 'mixdown';

function asBool(v: unknown): boolean {
  return v === 1 || v === true;
}

export class LocalStore {
  private db: Database.Database;

  constructor(dbPath = DB_PATH) {
    ensureDataDir();
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // --- writes ---------------------------------------------------------------

  upsertLocalSong(row: LocalSongRow): void {
    this.db
      .prepare(
        `INSERT INTO local_songs (id, global_song_id, title, language, original_key, default_bpm, preferred_performance_id, verified, created_at)
         VALUES (@id, @global_song_id, @title, @language, @original_key, @default_bpm, @preferred_performance_id, @verified, @created_at)
         ON CONFLICT(id) DO UPDATE SET global_song_id=@global_song_id, title=@title, language=@language,
           original_key=@original_key, default_bpm=@default_bpm, preferred_performance_id=@preferred_performance_id, verified=@verified`,
      )
      .run({ ...row, verified: row.verified ? 1 : 0 });
  }

  upsertService(row: ServiceRow): void {
    this.db
      .prepare(
        `INSERT INTO services (id, date, title, youtube_id) VALUES (@id, @date, @title, @youtube_id)
         ON CONFLICT(id) DO UPDATE SET date=@date, title=@title, youtube_id=@youtube_id`,
      )
      .run(row);
  }

  replaceSegments(serviceId: string, rows: SegmentRow[]): void {
    const del = this.db.prepare('DELETE FROM segments WHERE service_id = ?');
    const ins = this.db.prepare(
      `INSERT INTO segments (id, service_id, type, start_s, end_s, local_song_id)
       VALUES (@id, @service_id, @type, @start_s, @end_s, @local_song_id)`,
    );
    this.db.transaction(() => {
      del.run(serviceId);
      rows.forEach((r) => ins.run(r));
    })();
  }

  upsertPerformance(row: PerformanceRow): void {
    this.db
      .prepare(
        `INSERT INTO performances (id, local_song_id, service_id, youtube_id, start_s, end_s, key, bpm, chordpro, lrc, verified, created_at)
         VALUES (@id, @local_song_id, @service_id, @youtube_id, @start_s, @end_s, @key, @bpm, @chordpro, @lrc, @verified, @created_at)
         ON CONFLICT(id) DO UPDATE SET local_song_id=@local_song_id, service_id=@service_id, youtube_id=@youtube_id,
           start_s=@start_s, end_s=@end_s, key=@key, bpm=@bpm, chordpro=@chordpro, lrc=@lrc, verified=@verified`,
      )
      .run({ ...row, lrc: JSON.stringify(row.lrc), verified: row.verified ? 1 : 0 });
  }

  replaceSections(performanceId: string, rows: SectionRow[]): void {
    const del = this.db.prepare('DELETE FROM sections WHERE performance_id = ?');
    const ins = this.db.prepare(
      `INSERT INTO sections (performance_id, idx, label, start_s, end_s, start_bar, end_bar)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      del.run(performanceId);
      rows.forEach((r, i) => ins.run(performanceId, i, r.label, r.start_s, r.end_s, r.start_bar, r.end_bar));
    })();
  }

  setBeatgrid(performanceId: string, bpm: number, beats: number[], downbeats: number[]): void {
    this.db
      .prepare(
        `INSERT INTO beatgrid (performance_id, bpm, beats, downbeats) VALUES (?, ?, ?, ?)
         ON CONFLICT(performance_id) DO UPDATE SET bpm=excluded.bpm, beats=excluded.beats, downbeats=excluded.downbeats`,
      )
      .run(performanceId, bpm, JSON.stringify(beats), JSON.stringify(downbeats));
  }

  setChords(performanceId: string, data: ChordEvent[], verified: boolean): void {
    this.db
      .prepare(
        `INSERT INTO performance_chords (performance_id, data, verified) VALUES (?, ?, ?)
         ON CONFLICT(performance_id) DO UPDATE SET data=excluded.data, verified=excluded.verified`,
      )
      .run(performanceId, JSON.stringify(data), verified ? 1 : 0);
  }

  /** Register an audio file by ABSOLUTE path (stored relative to the data dir). */
  registerAudio(performanceId: string, kind: AudioKind, absPath: string, stem = '', semitones = 0): void {
    this.db
      .prepare(
        `INSERT INTO audio_files (performance_id, kind, stem, semitones, path) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(performance_id, kind, stem, semitones) DO UPDATE SET path=excluded.path`,
      )
      .run(performanceId, kind, stem, semitones, relative(DATA_DIR, absPath));
  }

  /** Mint-or-link bridge: record the global song id on a local song. */
  linkSong(localSongId: string, globalSongId: string): void {
    this.db
      .prepare('UPDATE local_songs SET global_song_id = ? WHERE id = ?')
      .run(globalSongId, localSongId);
  }

  // --- reads ----------------------------------------------------------------

  getLocalSong(id: string): LocalSongRow | null {
    const r = this.db.prepare('SELECT * FROM local_songs WHERE id = ?').get(id);
    return r ? rowToLocalSong(r) : null;
  }

  listSongs(): LocalSongRow[] {
    return this.db.prepare('SELECT * FROM local_songs ORDER BY title').all().map(rowToLocalSong);
  }

  /** The catalog LauDJ plays from: one entry per local song with a performance. */
  listCatalog(): LocalCatalogSong[] {
    return this.listSongs().map((song) => {
      const perf = this.preferredPerformance(song);
      const inventory = perf ? this.audioInventory(perf.id) : { stems: [], key_variants: [], mixdown: false };
      return {
        song_id: song.global_song_id ?? song.id,
        local_song_id: song.id,
        linked: song.global_song_id !== null,
        title: song.title,
        language: song.language,
        key: perf?.key ?? song.original_key,
        bpm: perf?.bpm ?? song.default_bpm,
        duration_s: perf ? Math.max(0, perf.end_s - perf.start_s) : 0,
        performance_id: perf?.id ?? null,
        sections: perf
          ? this.getSections(perf.id).map((s) => ({ label: s.label, start_s: s.start_s }))
          : [],
        stems: inventory.stems,
        key_variants: inventory.key_variants,
        verified: song.verified,
      };
    });
  }

  getPerformanceDetail(performanceId: string): LocalPerformanceDetail | null {
    const perf = this.getPerformance(performanceId);
    if (!perf) return null;
    const grid = this.db.prepare('SELECT * FROM beatgrid WHERE performance_id = ?').get(performanceId) as
      | { bpm: number; beats: string; downbeats: string }
      | undefined;
    const chords = this.db
      .prepare('SELECT data FROM performance_chords WHERE performance_id = ?')
      .get(performanceId) as { data: string } | undefined;
    return {
      performance_id: perf.id,
      local_song_id: perf.local_song_id,
      key: perf.key,
      bpm: perf.bpm,
      beats: grid ? (JSON.parse(grid.beats) as number[]) : [],
      downbeats: grid ? (JSON.parse(grid.downbeats) as number[]) : [],
      chords: chords ? (JSON.parse(chords.data) as ChordEvent[]) : [],
      sections: this.getSections(perf.id),
      lrc: perf.lrc,
      chordpro: perf.chordpro,
      audio: this.audioInventory(perf.id),
    };
  }

  getPerformance(id: string): PerformanceRow | null {
    const r = this.db.prepare('SELECT * FROM performances WHERE id = ?').get(id);
    return r ? rowToPerformance(r) : null;
  }

  getSections(performanceId: string): SectionRow[] {
    const rows = this.db
      .prepare('SELECT label, start_s, end_s, start_bar, end_bar FROM sections WHERE performance_id = ? ORDER BY idx')
      .all(performanceId) as SectionRow[];
    return rows;
  }

  /** Relative path of one audio file, or null when not on disk. */
  getAudioPath(performanceId: string, kind: AudioKind, stem = '', semitones = 0): string | null {
    const r = this.db
      .prepare('SELECT path FROM audio_files WHERE performance_id=? AND kind=? AND stem=? AND semitones=?')
      .get(performanceId, kind, stem, semitones) as { path: string } | undefined;
    return r?.path ?? null;
  }

  private preferredPerformance(song: LocalSongRow): PerformanceRow | null {
    if (song.preferred_performance_id) {
      const p = this.getPerformance(song.preferred_performance_id);
      if (p) return p;
    }
    const r = this.db
      .prepare('SELECT * FROM performances WHERE local_song_id = ? ORDER BY created_at LIMIT 1')
      .get(song.id);
    return r ? rowToPerformance(r) : null;
  }

  private audioInventory(performanceId: string): LocalPerformanceDetail['audio'] {
    const rows = this.db
      .prepare('SELECT kind, stem, semitones FROM audio_files WHERE performance_id = ?')
      .all(performanceId) as { kind: AudioKind; stem: string; semitones: number }[];
    const stems = ALL_STEMS.filter((s) => rows.some((r) => r.kind === 'stem' && r.stem === s));
    const variantSemis = [...new Set(rows.filter((r) => r.kind === 'variant').map((r) => r.semitones))];
    const key_variants = stems.length > 0 ? [...new Set([0, ...variantSemis])].sort((a, b) => a - b) : [];
    return { stems, key_variants, mixdown: rows.some((r) => r.kind === 'mixdown') };
  }
}

// better-sqlite3 returns untyped rows (`unknown`). The two mappers below (and
// the inline `as` on .get()/.all() results above) are the single, deliberate
// narrowing boundary between SQLite and the typed store API — every field is
// re-coerced (String/Number/asBool/JSON.parse), so a schema drift surfaces as
// a wrong value here, not as a silent bad type downstream.
function rowToLocalSong(r: unknown): LocalSongRow {
  const row = r as Record<string, unknown>;
  return {
    id: String(row.id),
    global_song_id: row.global_song_id === null ? null : String(row.global_song_id),
    title: String(row.title),
    language: row.language === 'en' ? 'en' : 'ro',
    original_key: String(row.original_key),
    default_bpm: Number(row.default_bpm),
    preferred_performance_id:
      row.preferred_performance_id === null ? null : String(row.preferred_performance_id),
    verified: asBool(row.verified),
    created_at: String(row.created_at),
  };
}

function rowToPerformance(r: unknown): PerformanceRow {
  const row = r as Record<string, unknown>;
  return {
    id: String(row.id),
    local_song_id: String(row.local_song_id),
    service_id: row.service_id === null ? null : String(row.service_id),
    youtube_id: row.youtube_id === null ? null : String(row.youtube_id),
    start_s: Number(row.start_s),
    end_s: Number(row.end_s),
    key: String(row.key),
    bpm: Number(row.bpm),
    chordpro: String(row.chordpro),
    lrc: JSON.parse(String(row.lrc)) as LrcLine[],
    verified: asBool(row.verified),
    created_at: String(row.created_at),
  };
}
