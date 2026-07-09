/** LocalStore roundtrip + v1→v2 migration tests (node:test, `npm test -w apps/studio`). */
import './test-env'; // MUST be first — points the store at a temp data dir
import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LocalStore, autoSectionPartMap, toDegreeChart, type LocalSongRow } from './index';
import { DATA_DIR } from './paths';

const NOW = '2026-07-09T00:00:00.000Z';
let counter = 0;

function freshPath(): string {
  counter += 1;
  return join(DATA_DIR, `test-${counter}.db`);
}

function songRow(id: string): LocalSongRow {
  return {
    id,
    global_song_id: null,
    link_state: 'local',
    title: 'Test Song',
    author: null,
    language: 'ro',
    chordpro: '{key: A}\n{start_of_verse: Verse 1}\n[1]la [4]la\n{end_of_verse}\n{start_of_chorus}\n[5]na [1]na\n{end_of_chorus}',
    chart_source: 'derived',
    analysis_key: 'A',
    derived_chordpro: null,
    snapshot_parts: null,
    snapshot_taken_at: null,
    preferred_performance_id: 'perf-1',
    verified: false,
    created_at: NOW,
    updated_at: NOW,
  };
}

function seedSong(store: LocalStore, id = 'song-test'): void {
  store.upsertLocalSong(songRow(id));
  store.upsertPerformance({
    id: 'perf-1',
    local_song_id: id,
    service_id: null,
    segment_id: null,
    source_uri: 'yt123',
    start_s: 0,
    end_s: 200,
    detected_key: 'A',
    bpm: 82,
    lrc: [{ time_s: 1, text: 'la la' }],
    verified: false,
    created_at: NOW,
  });
  const sections = [
    { id: 'sec-perf-1-1', label: 'Intro', ordinal: 1, start_s: 0, end_s: 20, start_bar: 0, end_bar: 5, variation_of: null },
    { id: 'sec-perf-1-2', label: 'Verse 1', ordinal: 1, start_s: 20, end_s: 100, start_bar: 5, end_bar: 25, variation_of: null },
    { id: 'sec-perf-1-3', label: 'Chorus', ordinal: 1, start_s: 100, end_s: 200, start_bar: 25, end_bar: 50, variation_of: null },
  ];
  store.replaceSections('perf-1', sections);
  store.replaceSectionPartMap('perf-1', autoSectionPartMap(sections, songRow(id).chordpro));
  store.setBeatgrid('perf-1', 82, [0, 0.7, 1.4], [0]);
  store.setChordEvents('perf-1', [{ start_s: 0, chord: 'A' }, { start_s: 2, chord: 'D' }], false);
}

test('catalog reflects song + preferred performance + sections', () => {
  const store = new LocalStore(freshPath());
  seedSong(store);
  const catalog = store.listCatalog();
  assert.equal(catalog.length, 1);
  const entry = catalog[0];
  assert.equal(entry.song_id, 'song-test', 'unlinked songs expose the local id');
  assert.equal(entry.linked, false);
  assert.equal(entry.performance_id, 'perf-1');
  assert.equal(entry.key, 'A', 'the playable key is the detected key');
  assert.equal(entry.duration_s, 200);
  assert.deepEqual(entry.sections.map((s) => s.label), ['Intro', 'Verse 1', 'Chorus']);
  assert.deepEqual(entry.stems, [], 'no audio registered → no stems');
  store.close();
});

test('the chart lives on the song; the performance carries evidence only', () => {
  const store = new LocalStore(freshPath());
  seedSong(store);
  const song = store.getSongDetail('song-test');
  assert.ok(song);
  assert.match(song.chordpro, /\{key: A\}/);
  assert.equal(song.analysis_key, 'A');
  const detail = store.getPerformanceDetail('perf-1');
  assert.ok(detail);
  assert.equal(detail.detected_key, 'A');
  assert.equal(detail.beats.length, 3);
  assert.deepEqual(detail.downbeats, [0]);
  assert.equal(detail.chord_events.length, 2);
  assert.equal(detail.lrc[0]?.text, 'la la');
  assert.equal('chordpro' in detail, false, 'no chart on the performance (DEC-58)');
  store.close();
});

test('mapping states: instrumental / accepted ref / unaligned cross the wire correctly', () => {
  const store = new LocalStore(freshPath());
  seedSong(store);
  const wire = store.listCatalog()[0].sections;
  // Intro → deliberate instrumental → null part on the wire.
  assert.equal(wire[0]?.part, null);
  // Verse/Chorus → accepted refs.
  assert.deepEqual(wire[1]?.part, { label: 'Verse 1', ordinal: 1 });
  assert.deepEqual(wire[2]?.part, { label: 'Chorus', ordinal: 1 });
  // In the store the states are distinct (DEC-62/63).
  const rows = store.getSectionPartMap('perf-1');
  const intro = rows.find((r) => r.section_id === 'sec-perf-1-1');
  assert.equal(intro?.is_instrumental, true);
  const verse = rows.find((r) => r.section_id === 'sec-perf-1-2');
  assert.equal(verse?.accepted, true);
  assert.equal(verse?.source, 'auto');
  store.close();
});

test('a proposal (accepted=0) does not cross the wire as a part', () => {
  const store = new LocalStore(freshPath());
  seedSong(store);
  store.replaceSectionPartMap('perf-1', [
    {
      section_id: 'sec-perf-1-2',
      part_label: 'Verse 1',
      part_ordinal: 1,
      is_instrumental: false,
      accepted: false,
      confidence: 0.4,
      source: 'auto',
    },
  ]);
  const wire = store.listCatalog()[0].sections;
  assert.equal(wire[1]?.part, null, 'below-threshold proposals announce instrumental');
  store.close();
});

test('registerAudio drives stems/key_variants/mixdown inventory', () => {
  const store = new LocalStore(freshPath());
  seedSong(store);
  const dir = join(DATA_DIR, 'audio', 'perf-1');
  mkdirSync(join(dir, 'variants'), { recursive: true });
  for (const stem of ['vocals', 'bass', 'drums', 'other'] as const) {
    const p = join(dir, `${stem}.ogg`);
    writeFileSync(p, 'x');
    store.registerAudio('perf-1', 'stem', p, stem);
  }
  const variant = join(dir, 'variants', 'bass+2.ogg');
  writeFileSync(variant, 'x');
  store.registerAudio('perf-1', 'variant', variant, 'bass', 2);
  const mix = join(dir, 'mixdown.ogg');
  writeFileSync(mix, 'x');
  store.registerAudio('perf-1', 'mixdown', mix);

  const entry = store.listCatalog()[0];
  assert.deepEqual(entry.stems, ['vocals', 'bass', 'drums', 'other']);
  assert.deepEqual(entry.key_variants, [0, 2]);
  assert.equal(store.getPerformanceDetail('perf-1')?.audio.mixdown, true);
  assert.equal(store.getAudioPath('perf-1', 'variant', 'bass', 2), join('audio', 'perf-1', 'variants', 'bass+2.ogg'));
  assert.equal(store.getAudioPath('perf-1', 'variant', 'bass', 7), null);
  store.close();
});

test('linkSong marks the song linked and swaps the catalog id', () => {
  const store = new LocalStore(freshPath());
  seedSong(store);
  store.linkSong('song-test', 'global-42');
  const entry = store.listCatalog()[0];
  assert.equal(entry.linked, true);
  assert.equal(entry.song_id, 'global-42');
  assert.equal(entry.local_song_id, 'song-test');
  assert.equal(store.getLocalSong('song-test')?.link_state, 'linked');
  store.close();
});

test('toDegreeChart converts letter charts once and leaves degree charts alone', () => {
  const letters = '[A]la [D]la';
  const degrees = toDegreeChart(letters, 'A');
  assert.match(degrees, /\{key: A\}/);
  assert.match(degrees, /\[1\]la \[4\]la/);
  assert.equal(toDegreeChart(degrees, 'A'), degrees, 'already-degrees passes through');
});

// --- v1 → v2 migration ------------------------------------------------------

const V1_SCHEMA = `
CREATE TABLE local_songs (
  id TEXT PRIMARY KEY, global_song_id TEXT, title TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ro', original_key TEXT NOT NULL,
  default_bpm REAL NOT NULL, preferred_performance_id TEXT,
  verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE services (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, title TEXT NOT NULL, youtube_id TEXT NOT NULL
);
CREATE TABLE segments (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, type TEXT NOT NULL,
  start_s REAL NOT NULL, end_s REAL NOT NULL, local_song_id TEXT
);
CREATE TABLE performances (
  id TEXT PRIMARY KEY, local_song_id TEXT NOT NULL, service_id TEXT, youtube_id TEXT,
  start_s REAL NOT NULL DEFAULT 0, end_s REAL NOT NULL DEFAULT 0,
  key TEXT NOT NULL, bpm REAL NOT NULL, chordpro TEXT NOT NULL DEFAULT '',
  lrc TEXT NOT NULL DEFAULT '[]', verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE sections (
  performance_id TEXT NOT NULL, idx INTEGER NOT NULL, label TEXT NOT NULL,
  start_s REAL NOT NULL, end_s REAL NOT NULL,
  start_bar INTEGER NOT NULL DEFAULT 0, end_bar INTEGER NOT NULL DEFAULT 0,
  work_part_index INTEGER, PRIMARY KEY (performance_id, idx)
);
CREATE TABLE beatgrid (
  performance_id TEXT PRIMARY KEY, bpm REAL NOT NULL, beats TEXT NOT NULL, downbeats TEXT NOT NULL
);
CREATE TABLE performance_chords (
  performance_id TEXT PRIMARY KEY, data TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE audio_files (
  performance_id TEXT NOT NULL, kind TEXT NOT NULL, stem TEXT NOT NULL DEFAULT '',
  semitones INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL,
  PRIMARY KEY (performance_id, kind, stem, semitones)
);
`;

test('v1 DBs migrate in place: chart hoists to the song as degrees; mapping is re-derived', () => {
  const dbPath = freshPath();
  const raw = new Database(dbPath);
  raw.exec(V1_SCHEMA);
  raw.prepare(
    `INSERT INTO local_songs (id, global_song_id, title, language, original_key, default_bpm, preferred_performance_id, verified, created_at)
     VALUES ('song-old', 'global-old', 'Old Song', 'ro', 'G', 72, 'perf-old', 1, ?)`,
  ).run(NOW);
  raw.prepare(
    `INSERT INTO performances (id, local_song_id, service_id, youtube_id, start_s, end_s, key, bpm, chordpro, lrc, verified, created_at)
     VALUES ('perf-old', 'song-old', 'svc-old', 'ytOLD', 0, 180, 'A', 74, ?, '[]', 0, ?)`,
  ).run('{start_of_verse: Verse 1}\n[A]veche [D]cale\n{end_of_verse}\n{start_of_chorus}\n[E]na [A]na\n{end_of_chorus}', NOW);
  raw.prepare(`INSERT INTO services (id, date, title, youtube_id) VALUES ('svc-old', '2026-07-01', 'Old service', 'ytOLD')`).run();
  const insSec = raw.prepare(
    `INSERT INTO sections (performance_id, idx, label, start_s, end_s, start_bar, end_bar, work_part_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insSec.run('perf-old', 0, 'Intro', 0, 10, 0, 2, null);
  insSec.run('perf-old', 1, 'Strofa 1', 10, 90, 2, 20, 0);
  insSec.run('perf-old', 2, 'Refren', 90, 180, 20, 40, 1);
  raw.prepare(`INSERT INTO performance_chords (performance_id, data, verified) VALUES ('perf-old', '[{"start_s":0,"chord":"A"}]', 1)`).run();
  raw.close();

  const store = new LocalStore(dbPath);
  const song = store.getLocalSong('song-old');
  assert.ok(song);
  assert.equal(song.link_state, 'linked');
  assert.equal(song.analysis_key, 'A', 'analysis key comes from the chart-bearing performance');
  assert.match(song.chordpro, /\{key: A\}/, 'hoisted chart is degrees + reference key');
  assert.match(song.chordpro, /\[1\]veche \[4\]cale/);

  const perf = store.getPerformance('perf-old');
  assert.equal(perf?.detected_key, 'A');
  assert.equal(perf?.source_uri, 'ytOLD');

  const detail = store.getPerformanceDetail('perf-old');
  assert.ok(detail);
  assert.equal(detail.chord_events.length, 1, 'performance_chords ported to chord_events');
  assert.deepEqual(detail.sections.map((s) => s.label), ['Intro', 'Strofa 1', 'Refren']);
  // The matcher re-ran (DEC-56): RO labels map to the chart's parts.
  assert.equal(detail.sections[0]?.part, null);
  assert.deepEqual(detail.sections[1]?.part, { label: 'Verse 1', ordinal: 1 });
  assert.deepEqual(detail.sections[2]?.part, { label: 'Chorus', ordinal: 1 });

  // Re-opening a migrated DB is a no-op.
  store.close();
  const again = new LocalStore(dbPath);
  assert.equal(again.listCatalog().length, 1);
  again.close();
});
