/**
 * SQLite schema for the LaudStudio local-first store — v2 (WP-102, the
 * Local Schema spec).
 *
 * The load-bearing rules:
 *  - TWO CHART DOMAINS, ONE SONG (DEC-58): the chart (degrees anchored to
 *    syllables) is a property of the WORK → local_songs.chordpro. Chord
 *    EVENTS (absolute pitches at timestamps) and LRC are properties of a
 *    RECORDING → performances/chord_events. The LRC × chord-events
 *    intersection is a derivation step, not a second chart.
 *  - DEGREES ARE GROUND TRUTH (DEC-59): local_songs.chordpro holds Nashville
 *    degrees computed at extraction against analysis_key. RE-KEY rotates the
 *    degrees (analysis_key is the knob); TRANSPOSE is not a local operation.
 *  - preferred_performance_id picks AUDIO only, never the chart.
 *  - Ingest is song-first (DEC-67): one file → one local_song → one
 *    performance, plus a degenerate one-segment service (segmentation later
 *    produces the same rows).
 *  - section_part_map states (DEC-62/63): no row = unaligned · accepted=0 =
 *    proposal held below threshold · accepted=1 = drives · is_instrumental=1
 *    = deliberately no part. Unaligned/proposed/instrumental all announce
 *    INSTRUMENTAL on the wire; they differ only in the editor.
 */
export const SCHEMA_VERSION = 2;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_songs (
  id TEXT PRIMARY KEY,
  global_song_id TEXT,
  link_state TEXT NOT NULL DEFAULT 'local' CHECK (link_state IN ('local', 'linked')),
  title TEXT NOT NULL,
  author TEXT,
  language TEXT NOT NULL DEFAULT 'ro',
  chordpro TEXT NOT NULL DEFAULT '',       -- the ACTIVE chart (degrees + {key:})
  chart_source TEXT NOT NULL DEFAULT 'derived' CHECK (chart_source IN ('derived', 'snapshot')),
  analysis_key TEXT NOT NULL,              -- the re-key knob (DEC-59)
  derived_chordpro TEXT,                   -- kept ONLY if the editor touched it before link (DEC-61)
  snapshot_parts TEXT,                     -- JSON {parts: [{label, ordinal, first_line}], fingerprint}
  snapshot_taken_at TEXT,
  preferred_performance_id TEXT,           -- AUDIO selection only, never the chart
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  source_uri TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  type TEXT NOT NULL,
  start_s REAL NOT NULL,
  end_s REAL NOT NULL,
  local_song_id TEXT REFERENCES local_songs(id)
);

CREATE TABLE IF NOT EXISTS performances (
  id TEXT PRIMARY KEY,
  local_song_id TEXT NOT NULL REFERENCES local_songs(id),
  service_id TEXT REFERENCES services(id),
  -- soft reference: segments are bulk-replaced (degenerate one-segment
  -- services, DEC-67), so enforcing the FK would break idempotent re-ingest
  segment_id TEXT,
  source_uri TEXT,
  start_s REAL NOT NULL DEFAULT 0,
  end_s REAL NOT NULL DEFAULT 0,
  detected_key TEXT NOT NULL,              -- this recording's key (DEC-60)
  bpm REAL NOT NULL,
  lrc TEXT NOT NULL DEFAULT '[]',          -- JSON LrcLine[]; NEVER crosses to global (DEC-44)
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  performance_id TEXT NOT NULL REFERENCES performances(id),
  position INTEGER NOT NULL,               -- play order within the performance
  label TEXT NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 1,      -- occurrence among same-label sections
  start_s REAL NOT NULL,
  end_s REAL NOT NULL,
  start_bar INTEGER NOT NULL DEFAULT 0,
  end_bar INTEGER NOT NULL DEFAULT 0,
  variation_of TEXT                        -- section id: 'verse 2 sung differently'
);

CREATE TABLE IF NOT EXISTS beatgrid (
  performance_id TEXT PRIMARY KEY REFERENCES performances(id),
  bpm REAL NOT NULL,
  beats TEXT NOT NULL,                     -- JSON number[] (seconds)
  downbeats TEXT NOT NULL                  -- JSON number[] (indices into beats)
);

CREATE TABLE IF NOT EXISTS chord_events (
  performance_id TEXT PRIMARY KEY REFERENCES performances(id),
  data TEXT NOT NULL,                      -- JSON ChordEvent[] (time domain, absolute pitch)
  verified INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS section_part_map (
  section_id TEXT PRIMARY KEY REFERENCES sections(id),
  performance_id TEXT NOT NULL REFERENCES performances(id),
  part_label TEXT,                         -- NULL when is_instrumental
  part_ordinal INTEGER,                    -- NULL when is_instrumental
  is_instrumental INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,     -- proposals (accepted=0) do NOT drive
  confidence REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('auto', 'human'))
);

CREATE TABLE IF NOT EXISTS audio_files (
  performance_id TEXT NOT NULL REFERENCES performances(id),
  kind TEXT NOT NULL CHECK (kind IN ('stem', 'variant', 'mixdown')),
  stem TEXT NOT NULL DEFAULT '',           -- '' for mixdown
  semitones INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL,                      -- relative to the data dir
  PRIMARY KEY (performance_id, kind, stem, semitones)
);
`;

/** True when the open DB predates v2 (chart still on performances). */
export function isLegacyV1(columnsOf: (table: string) => string[]): boolean {
  const perfCols = columnsOf('performances');
  return perfCols.length > 0 && perfCols.includes('chordpro');
}
