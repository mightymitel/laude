/**
 * SQLite schema for the LaudStudio local-first store.
 *
 * ASSUMPTIONS (local-schema spec pending — fold these back into the spec):
 *  - one row per local song; `global_song_id` NULL until the mint-or-link
 *    bridge links/uploads it (then it holds the global Firestore song id).
 *  - the extracted chart (chordpro) + karaoke timing (lrc) attach to the
 *    PERFORMANCE (a rendition), not the song; the link step promotes the
 *    preferred performance's chart to the global `song_lyrics`.
 *  - beat grid / chord events stored as JSON columns (read whole, never
 *    queried by element) — keeps the schema flat without a beats table.
 *  - audio files are catalogued in `audio_files` with paths relative to the
 *    data dir; layout itself is an implementation detail (see paths.ts).
 */
/** Additive migrations for pre-existing local DBs (checked per boot). */
export const MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  {
    table: 'sections',
    column: 'work_part_index',
    ddl: 'ALTER TABLE sections ADD COLUMN work_part_index INTEGER',
  },
];

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_songs (
  id TEXT PRIMARY KEY,
  global_song_id TEXT,
  title TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ro',
  original_key TEXT NOT NULL,
  default_bpm REAL NOT NULL,
  preferred_performance_id TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  youtube_id TEXT NOT NULL
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
  youtube_id TEXT,
  start_s REAL NOT NULL DEFAULT 0,
  end_s REAL NOT NULL DEFAULT 0,
  key TEXT NOT NULL,
  bpm REAL NOT NULL,
  chordpro TEXT NOT NULL DEFAULT '',
  lrc TEXT NOT NULL DEFAULT '[]',      -- JSON LrcLine[]
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  performance_id TEXT NOT NULL REFERENCES performances(id),
  idx INTEGER NOT NULL,
  label TEXT NOT NULL,
  start_s REAL NOT NULL,
  end_s REAL NOT NULL,
  start_bar INTEGER NOT NULL DEFAULT 0,
  end_bar INTEGER NOT NULL DEFAULT 0,
  work_part_index INTEGER,             -- one-way DJ section -> work part (DEC-43)
  PRIMARY KEY (performance_id, idx)
);

CREATE TABLE IF NOT EXISTS beatgrid (
  performance_id TEXT PRIMARY KEY REFERENCES performances(id),
  bpm REAL NOT NULL,
  beats TEXT NOT NULL,                 -- JSON number[] (seconds)
  downbeats TEXT NOT NULL              -- JSON number[] (indices into beats)
);

CREATE TABLE IF NOT EXISTS performance_chords (
  performance_id TEXT PRIMARY KEY REFERENCES performances(id),
  data TEXT NOT NULL,                  -- JSON ChordEvent[]
  verified INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audio_files (
  performance_id TEXT NOT NULL REFERENCES performances(id),
  kind TEXT NOT NULL CHECK (kind IN ('stem', 'variant', 'mixdown')),
  stem TEXT NOT NULL DEFAULT '',       -- '' for mixdown
  semitones INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL,                  -- relative to the data dir
  PRIMARY KEY (performance_id, kind, stem, semitones)
);
`;
