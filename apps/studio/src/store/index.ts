/**
 * LaudStudio local-first store: typed access over SQLite (better-sqlite3).
 * One shared store for LaudStudio + LauDJ (LauDJ reads it over the local
 * HTTP service — see src/service/). All writes go through this module.
 *
 * Schema rules live in ./schema (v2, WP-102). Legacy v1 DBs (chart on the
 * performance) are migrated in place on open — see migrateV1toV2.
 */
import Database from 'better-sqlite3';
import { relative } from 'node:path';
import { convertChordPro, isDegreeToken } from '@laude/chords';
import type {
  ChordEvent,
  Lang,
  LocalCatalogSong,
  LocalPerformanceDetail,
  LocalSectionWire,
  LocalSongDetail,
  LrcLine,
  StemName,
  WorkPartRef,
} from '@laude/song-model';
import { ALL_STEMS } from '@laude/song-model';
import { DATA_DIR, DB_PATH, ensureDataDir } from './paths';
import { isLegacyV1, SCHEMA, SCHEMA_VERSION } from './schema';
import { mapSectionsToPartRefs } from './partmap';

export interface SnapshotPart {
  label: string;
  ordinal: number;
  first_line: string;
}

export interface SnapshotParts {
  parts: SnapshotPart[];
  fingerprint: string;
}

export interface LocalSongRow {
  id: string;
  global_song_id: string | null;
  link_state: 'local' | 'linked';
  title: string;
  author: string | null;
  language: Lang;
  /** The ACTIVE chart: Nashville degrees + head {key:} (DEC-58/59). */
  chordpro: string;
  chart_source: 'derived' | 'snapshot';
  /** The key the degrees were computed against — the re-key knob. */
  analysis_key: string;
  /** Kept ONLY if the editor touched the chart before a link (DEC-61). */
  derived_chordpro: string | null;
  snapshot_parts: SnapshotParts | null;
  snapshot_taken_at: string | null;
  /** Picks AUDIO only, never the chart. */
  preferred_performance_id: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface PerformanceRow {
  id: string;
  local_song_id: string;
  service_id: string | null;
  segment_id: string | null;
  source_uri: string | null;
  start_s: number;
  end_s: number;
  /** This recording's key — drives stem key-variant rendering (DEC-60). */
  detected_key: string;
  bpm: number;
  lrc: LrcLine[];
  verified: boolean;
  created_at: string;
}

export interface SectionRow {
  id: string;
  label: string;
  /** 1-based occurrence among sections sharing this label. */
  ordinal: number;
  start_s: number;
  end_s: number;
  start_bar: number;
  end_bar: number;
  variation_of: string | null;
}

/**
 * One row of the one-way section → work-part mapping. Four states
 * (DEC-62/63): no row = unaligned · is_instrumental = deliberate no-part ·
 * accepted=0 = proposal (does NOT drive) · accepted=1 = drives.
 */
export interface SectionPartMapRow {
  section_id: string;
  part_label: string | null;
  part_ordinal: number | null;
  is_instrumental: boolean;
  accepted: boolean;
  confidence: number;
  source: 'auto' | 'human';
}

export interface ServiceRow {
  id: string;
  date: string;
  title: string;
  source_uri: string;
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
    const columnsOf = (table: string): string[] =>
      (this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
        (c) => c.name,
      );
    if (isLegacyV1(columnsOf)) migrateV1toV2(this.db);
    this.db.exec(SCHEMA);
    this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }

  close(): void {
    this.db.close();
  }

  // --- writes ---------------------------------------------------------------

  upsertLocalSong(row: LocalSongRow): void {
    this.db
      .prepare(
        `INSERT INTO local_songs (id, global_song_id, link_state, title, author, language, chordpro, chart_source,
           analysis_key, derived_chordpro, snapshot_parts, snapshot_taken_at, preferred_performance_id, verified, created_at, updated_at)
         VALUES (@id, @global_song_id, @link_state, @title, @author, @language, @chordpro, @chart_source,
           @analysis_key, @derived_chordpro, @snapshot_parts, @snapshot_taken_at, @preferred_performance_id, @verified, @created_at, @updated_at)
         ON CONFLICT(id) DO UPDATE SET global_song_id=@global_song_id, link_state=@link_state, title=@title,
           author=@author, language=@language, chordpro=@chordpro, chart_source=@chart_source,
           analysis_key=@analysis_key, derived_chordpro=@derived_chordpro, snapshot_parts=@snapshot_parts,
           snapshot_taken_at=@snapshot_taken_at, preferred_performance_id=@preferred_performance_id,
           verified=@verified, updated_at=@updated_at`,
      )
      .run({
        ...row,
        snapshot_parts: row.snapshot_parts === null ? null : JSON.stringify(row.snapshot_parts),
        verified: row.verified ? 1 : 0,
      });
  }

  upsertService(row: ServiceRow): void {
    this.db
      .prepare(
        `INSERT INTO services (id, date, title, source_uri) VALUES (@id, @date, @title, @source_uri)
         ON CONFLICT(id) DO UPDATE SET date=@date, title=@title, source_uri=@source_uri`,
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
        `INSERT INTO performances (id, local_song_id, service_id, segment_id, source_uri, start_s, end_s, detected_key, bpm, lrc, verified, created_at)
         VALUES (@id, @local_song_id, @service_id, @segment_id, @source_uri, @start_s, @end_s, @detected_key, @bpm, @lrc, @verified, @created_at)
         ON CONFLICT(id) DO UPDATE SET local_song_id=@local_song_id, service_id=@service_id, segment_id=@segment_id,
           source_uri=@source_uri, start_s=@start_s, end_s=@end_s, detected_key=@detected_key, bpm=@bpm, lrc=@lrc, verified=@verified`,
      )
      .run({ ...row, lrc: JSON.stringify(row.lrc), verified: row.verified ? 1 : 0 });
  }

  replaceSections(performanceId: string, rows: SectionRow[]): void {
    const delMap = this.db.prepare('DELETE FROM section_part_map WHERE performance_id = ?');
    const del = this.db.prepare('DELETE FROM sections WHERE performance_id = ?');
    const ins = this.db.prepare(
      `INSERT INTO sections (id, performance_id, position, label, ordinal, start_s, end_s, start_bar, end_bar, variation_of)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      delMap.run(performanceId);
      del.run(performanceId);
      rows.forEach((r, i) =>
        ins.run(r.id, performanceId, i, r.label, r.ordinal, r.start_s, r.end_s, r.start_bar, r.end_bar, r.variation_of),
      );
    })();
  }

  replaceSectionPartMap(performanceId: string, rows: SectionPartMapRow[]): void {
    const del = this.db.prepare('DELETE FROM section_part_map WHERE performance_id = ?');
    const ins = this.db.prepare(
      `INSERT INTO section_part_map (section_id, performance_id, part_label, part_ordinal, is_instrumental, accepted, confidence, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      del.run(performanceId);
      rows.forEach((r) =>
        ins.run(
          r.section_id,
          performanceId,
          r.part_label,
          r.part_ordinal,
          r.is_instrumental ? 1 : 0,
          r.accepted ? 1 : 0,
          r.confidence,
          r.source,
        ),
      );
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

  setChordEvents(performanceId: string, data: ChordEvent[], verified: boolean): void {
    this.db
      .prepare(
        `INSERT INTO chord_events (performance_id, data, verified) VALUES (?, ?, ?)
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
      .prepare(
        `UPDATE local_songs SET global_song_id = ?, link_state = 'linked', updated_at = ? WHERE id = ?`,
      )
      .run(globalSongId, new Date().toISOString(), localSongId);
  }

  /**
   * UNLINK (DEC-61/68): drop the global id; the chart becomes
   * derived_chordpro where the editor did work, or the snapshot is promoted
   * to an editable chart where it didn't. Lossless exactly where work was
   * done, free where it wasn't. There is NO fork verb — "I disagree with the
   * community chart" is unlink → edit → mint.
   */
  unlinkSong(localSongId: string): void {
    const song = this.getLocalSong(localSongId);
    if (!song) throw new Error(`unknown local song ${localSongId}`);
    this.upsertLocalSong({
      ...song,
      global_song_id: null,
      link_state: 'local',
      chordpro: song.derived_chordpro ?? song.chordpro,
      chart_source: 'derived',
      derived_chordpro: null,
      snapshot_parts: null,
      snapshot_taken_at: null,
      updated_at: new Date().toISOString(),
    });
  }

  listPerformances(localSongId: string): PerformanceRow[] {
    return this.db
      .prepare('SELECT * FROM performances WHERE local_song_id = ? ORDER BY created_at')
      .all(localSongId)
      .map(rowToPerformance);
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
        linked: song.link_state === 'linked',
        title: song.title,
        language: song.language,
        key: perf?.detected_key ?? song.analysis_key,
        bpm: perf?.bpm ?? 0,
        duration_s: perf ? Math.max(0, perf.end_s - perf.start_s) : 0,
        performance_id: perf?.id ?? null,
        sections: perf ? this.sectionsWire(perf.id) : [],
        stems: inventory.stems,
        key_variants: inventory.key_variants,
        verified: song.verified,
      };
    });
  }

  /** Work-level detail (the chart) — by-value payloads + offline cache (DEC-61). */
  getSongDetail(localSongId: string): LocalSongDetail | null {
    const song = this.getLocalSong(localSongId);
    if (!song) return null;
    return {
      local_song_id: song.id,
      global_song_id: song.global_song_id,
      link_state: song.link_state,
      title: song.title,
      language: song.language,
      chordpro: song.chordpro,
      chart_source: song.chart_source,
      analysis_key: song.analysis_key,
      verified: song.verified,
    };
  }

  getPerformanceDetail(performanceId: string): LocalPerformanceDetail | null {
    const perf = this.getPerformance(performanceId);
    if (!perf) return null;
    const grid = this.db.prepare('SELECT * FROM beatgrid WHERE performance_id = ?').get(performanceId) as
      | { bpm: number; beats: string; downbeats: string }
      | undefined;
    const events = this.db
      .prepare('SELECT data FROM chord_events WHERE performance_id = ?')
      .get(performanceId) as { data: string } | undefined;
    return {
      performance_id: perf.id,
      local_song_id: perf.local_song_id,
      detected_key: perf.detected_key,
      bpm: perf.bpm,
      beats: grid ? (JSON.parse(grid.beats) as number[]) : [],
      downbeats: grid ? (JSON.parse(grid.downbeats) as number[]) : [],
      chord_events: events ? (JSON.parse(events.data) as ChordEvent[]) : [],
      sections: this.sectionsWire(perf.id),
      lrc: perf.lrc,
      audio: this.audioInventory(perf.id),
    };
  }

  getPerformance(id: string): PerformanceRow | null {
    const r = this.db.prepare('SELECT * FROM performances WHERE id = ?').get(id);
    return r ? rowToPerformance(r) : null;
  }

  getSections(performanceId: string): SectionRow[] {
    const rows = this.db
      .prepare(
        'SELECT id, label, ordinal, start_s, end_s, start_bar, end_bar, variation_of FROM sections WHERE performance_id = ? ORDER BY position',
      )
      .all(performanceId) as SectionRow[];
    return rows;
  }

  getSectionPartMap(performanceId: string): SectionPartMapRow[] {
    const rows = this.db
      .prepare('SELECT * FROM section_part_map WHERE performance_id = ?')
      .all(performanceId) as Record<string, unknown>[];
    return rows.map((row) => ({
      section_id: String(row.section_id),
      part_label: row.part_label === null ? null : String(row.part_label),
      part_ordinal: row.part_ordinal === null ? null : Number(row.part_ordinal),
      is_instrumental: asBool(row.is_instrumental),
      accepted: asBool(row.accepted),
      confidence: Number(row.confidence),
      source: row.source === 'human' ? 'human' : 'auto',
    }));
  }

  /** Relative path of one audio file, or null when not on disk. */
  getAudioPath(performanceId: string, kind: AudioKind, stem = '', semitones = 0): string | null {
    const r = this.db
      .prepare('SELECT path FROM audio_files WHERE performance_id=? AND kind=? AND stem=? AND semitones=?')
      .get(performanceId, kind, stem, semitones) as { path: string } | undefined;
    return r?.path ?? null;
  }

  /** Wire view of sections: ACCEPTED mappings expose the part ref; proposals,
   * instrumentals and unaligned sections are all null (announce instrumental). */
  private sectionsWire(performanceId: string): LocalSectionWire[] {
    const map = new Map<string, WorkPartRef | null>();
    for (const row of this.getSectionPartMap(performanceId)) {
      map.set(
        row.section_id,
        row.accepted && !row.is_instrumental && row.part_label !== null && row.part_ordinal !== null
          ? { label: row.part_label, ordinal: row.part_ordinal }
          : null,
      );
    }
    return this.getSections(performanceId).map((s) => ({
      id: s.id,
      label: s.label,
      ordinal: s.ordinal,
      start_s: s.start_s,
      end_s: s.end_s,
      start_bar: s.start_bar,
      end_bar: s.end_bar,
      part: map.get(s.id) ?? null,
    }));
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

/**
 * In-place v1 → v2 migration (WP-102). The v1 store kept the chart + key on
 * the performance and the mapping as sections.work_part_index. Ports:
 *  - local_songs: chart hoisted from the preferred/first performance,
 *    converted to degrees against that performance's key (analysis_key) —
 *    degrees are computed at extraction from now on (DEC-59);
 *  - performances: key → detected_key, youtube_id → source_uri, chart column
 *    dropped; performance_chords → chord_events;
 *  - sections: gain ids + ordinals; work_part_index is NOT ported — the
 *    auto-matcher is re-run instead (DEC-56: repair needs no stored
 *    correspondence), writing section_part_map rows.
 */
function migrateV1toV2(db: Database.Database): void {
  const nowIso = new Date().toISOString();
  const legacySongs = db.prepare('SELECT * FROM local_songs').all() as Record<string, unknown>[];
  const legacyPerformances = db.prepare('SELECT * FROM performances').all() as Record<string, unknown>[];
  const legacySections = db
    .prepare('SELECT * FROM sections ORDER BY performance_id, idx')
    .all() as Record<string, unknown>[];
  const legacyServices = db.prepare('SELECT * FROM services').all() as Record<string, unknown>[];
  const legacyChords = db.prepare('SELECT * FROM performance_chords').all() as Record<string, unknown>[];

  // Table rebuild: FK enforcement off for the duration (the standard SQLite
  // migration pattern — rows are re-inserted in bulk, order-independent).
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec(
      'DROP TABLE local_songs; DROP TABLE performances; DROP TABLE sections; DROP TABLE performance_chords; DROP TABLE services;',
    );
    db.exec(SCHEMA);

    const perfBySong = new Map<string, Record<string, unknown>[]>();
    for (const p of legacyPerformances) {
      const list = perfBySong.get(String(p.local_song_id)) ?? [];
      list.push(p);
      perfBySong.set(String(p.local_song_id), list);
    }

    const insSong = db.prepare(
      `INSERT INTO local_songs (id, global_song_id, link_state, title, author, language, chordpro, chart_source,
         analysis_key, preferred_performance_id, verified, created_at, updated_at)
       VALUES (@id, @global_song_id, @link_state, @title, NULL, @language, @chordpro, 'derived',
         @analysis_key, @preferred_performance_id, @verified, @created_at, @updated_at)`,
    );
    for (const s of legacySongs) {
      const perfs = perfBySong.get(String(s.id)) ?? [];
      const preferred =
        perfs.find((p) => p.id === s.preferred_performance_id) ?? perfs[0] ?? null;
      const rawChart = preferred ? String(preferred.chordpro ?? '') : '';
      const analysisKey = preferred ? String(preferred.key) : String(s.original_key ?? 'C');
      insSong.run({
        id: String(s.id),
        global_song_id: s.global_song_id ?? null,
        link_state: s.global_song_id ? 'linked' : 'local',
        title: String(s.title),
        language: String(s.language),
        chordpro: toDegreeChart(rawChart, analysisKey),
        analysis_key: analysisKey,
        preferred_performance_id: s.preferred_performance_id ?? null,
        verified: asBool(s.verified) ? 1 : 0,
        created_at: String(s.created_at),
        updated_at: nowIso,
      });
    }

    const insPerf = db.prepare(
      `INSERT INTO performances (id, local_song_id, service_id, segment_id, source_uri, start_s, end_s, detected_key, bpm, lrc, verified, created_at)
       VALUES (@id, @local_song_id, @service_id, NULL, @source_uri, @start_s, @end_s, @detected_key, @bpm, @lrc, @verified, @created_at)`,
    );
    for (const p of legacyPerformances) {
      insPerf.run({
        id: String(p.id),
        local_song_id: String(p.local_song_id),
        service_id: p.service_id ?? null,
        source_uri: p.youtube_id ?? null,
        start_s: Number(p.start_s),
        end_s: Number(p.end_s),
        detected_key: String(p.key),
        bpm: Number(p.bpm),
        lrc: String(p.lrc ?? '[]'),
        verified: asBool(p.verified) ? 1 : 0,
        created_at: String(p.created_at),
      });
    }

    // services: youtube_id → source_uri (recreated above; v1 had NOT NULL youtube_id).
    const insSvc = db.prepare(
      'INSERT OR REPLACE INTO services (id, date, title, source_uri) VALUES (?, ?, ?, ?)',
    );
    for (const s of legacyServices) {
      insSvc.run(String(s.id), String(s.date), String(s.title), String(s.youtube_id ?? ''));
    }

    const insSec = db.prepare(
      `INSERT INTO sections (id, performance_id, position, label, ordinal, start_s, end_s, start_bar, end_bar, variation_of)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    );
    const labelCounts = new Map<string, number>();
    const sectionsByPerf = new Map<string, { id: string; label: string }[]>();
    for (const sec of legacySections) {
      const perfId = String(sec.performance_id);
      const idx = Number(sec.idx);
      const label = String(sec.label);
      const countKey = `${perfId}:${label}`;
      const ordinal = (labelCounts.get(countKey) ?? 0) + 1;
      labelCounts.set(countKey, ordinal);
      const id = `sec-${perfId}-${idx + 1}`;
      insSec.run(id, perfId, idx, label, ordinal, Number(sec.start_s), Number(sec.end_s), Number(sec.start_bar), Number(sec.end_bar));
      const list = sectionsByPerf.get(perfId) ?? [];
      list.push({ id, label });
      sectionsByPerf.set(perfId, list);
    }

    const insEvents = db.prepare(
      'INSERT INTO chord_events (performance_id, data, verified) VALUES (?, ?, ?)',
    );
    for (const c of legacyChords) {
      insEvents.run(String(c.performance_id), String(c.data), asBool(c.verified) ? 1 : 0);
    }

    // Re-run the auto-matcher against the (now song-level) chart — DEC-56.
    const insMap = db.prepare(
      `INSERT INTO section_part_map (section_id, performance_id, part_label, part_ordinal, is_instrumental, accepted, confidence, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'auto')`,
    );
    for (const p of legacyPerformances) {
      const perfId = String(p.id);
      const secs = sectionsByPerf.get(perfId) ?? [];
      if (secs.length === 0) continue;
      const songRow = db.prepare('SELECT chordpro FROM local_songs WHERE id = ?').get(String(p.local_song_id)) as
        | { chordpro: string }
        | undefined;
      const targets = mapSectionsToPartRefs(secs.map((s) => s.label), songRow?.chordpro ?? '');
      secs.forEach((sec, i) => {
        const target = targets[i] ?? null;
        if (target === null) return; // unaligned: no row
        if (target === 'instrumental') {
          insMap.run(sec.id, perfId, null, null, 1, 1, 1);
          return;
        }
        insMap.run(sec.id, perfId, target.label, target.ordinal, 0, 1, HEURISTIC_CONFIDENCE);
      });
    }
  })();
  db.pragma('foreign_keys = ON');
}

/** Label-classification matches inside a confirmed song: confident, auto-accepted. */
export const HEURISTIC_CONFIDENCE = 0.8;

/**
 * Auto-matcher output → mapping rows (ingest/seed/re-align all share this):
 * instrumental targets become deliberate no-part rows; unaligned sections get
 * NO row; matched labels are auto-accepted at heuristic confidence.
 */
export function autoSectionPartMap(
  sections: { id: string; label: string }[],
  chordpro: string,
): SectionPartMapRow[] {
  const targets = mapSectionsToPartRefs(sections.map((s) => s.label), chordpro);
  const rows: SectionPartMapRow[] = [];
  sections.forEach((sec, i) => {
    const target = targets[i] ?? null;
    if (target === null) return;
    if (target === 'instrumental') {
      rows.push({
        section_id: sec.id,
        part_label: null,
        part_ordinal: null,
        is_instrumental: true,
        accepted: true,
        confidence: 1,
        source: 'auto',
      });
      return;
    }
    rows.push({
      section_id: sec.id,
      part_label: target.label,
      part_ordinal: target.ordinal,
      is_instrumental: false,
      accepted: true,
      confidence: HEURISTIC_CONFIDENCE,
      source: 'auto',
    });
  });
  return rows;
}

/** Ensure a chart is stored as degrees (DEC-59): letter charts convert once. */
export function toDegreeChart(chordpro: string, analysisKey: string): string {
  if (!chordpro.trim()) return chordpro;
  const firstToken = /\[([^\]]+)\]/.exec(chordpro)?.[1];
  if (firstToken !== undefined && isDegreeToken(firstToken)) return chordpro;
  return convertChordPro(chordpro, { toNotation: 'nashville', key: analysisKey });
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
    link_state: row.link_state === 'linked' ? 'linked' : 'local',
    title: String(row.title),
    author: row.author === null ? null : String(row.author),
    language: row.language === 'en' ? 'en' : 'ro',
    chordpro: String(row.chordpro),
    chart_source: row.chart_source === 'snapshot' ? 'snapshot' : 'derived',
    analysis_key: String(row.analysis_key),
    derived_chordpro: row.derived_chordpro === null ? null : String(row.derived_chordpro),
    snapshot_parts:
      row.snapshot_parts === null ? null : (JSON.parse(String(row.snapshot_parts)) as SnapshotParts),
    snapshot_taken_at: row.snapshot_taken_at === null ? null : String(row.snapshot_taken_at),
    preferred_performance_id:
      row.preferred_performance_id === null ? null : String(row.preferred_performance_id),
    verified: asBool(row.verified),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToPerformance(r: unknown): PerformanceRow {
  const row = r as Record<string, unknown>;
  return {
    id: String(row.id),
    local_song_id: String(row.local_song_id),
    service_id: row.service_id === null ? null : String(row.service_id),
    segment_id: row.segment_id === null ? null : String(row.segment_id),
    source_uri: row.source_uri === null ? null : String(row.source_uri),
    start_s: Number(row.start_s),
    end_s: Number(row.end_s),
    detected_key: String(row.detected_key),
    bpm: Number(row.bpm),
    lrc: JSON.parse(String(row.lrc)) as LrcLine[],
    verified: asBool(row.verified),
    created_at: String(row.created_at),
  };
}
