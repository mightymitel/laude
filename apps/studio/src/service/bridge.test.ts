/** Bridge pieces that need no cloud: alignment matcher, snapshot, unlink (WP-103). */
import '../store/test-env'; // MUST be first — temp data dir
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { LocalStore, type LocalSongRow } from '../store';
import { DATA_DIR } from '../store/paths';
import { ALIGN_THRESHOLD, alignSections, lyricSimilarity } from './align';
import { chartSnapshotParts } from './snapshot';

const NOW = '2026-07-09T00:00:00.000Z';
let n = 0;
const fresh = () => new LocalStore(join(DATA_DIR, `bridge-${++n}.db`));

const CHART = '{key: G}\n{start_of_verse: Verse 1}\n[1]Amazing grace how [4]sweet the sound\n{end_of_verse}\n{start_of_chorus}\n[5]My chains are gone\n{end_of_chorus}';

function baseSong(id: string): LocalSongRow {
  return {
    id,
    global_song_id: null,
    link_state: 'local',
    title: 'Amazing Grace',
    author: null,
    language: 'en',
    chordpro: CHART,
    chart_source: 'derived',
    analysis_key: 'G',
    derived_chordpro: null,
    snapshot_parts: null,
    snapshot_taken_at: null,
    preferred_performance_id: null,
    verified: false,
    created_at: NOW,
    updated_at: NOW,
  };
}

test('snapshot: (label, ordinal, first_line) per part + stable fingerprint', () => {
  const snap = chartSnapshotParts(CHART);
  assert.deepEqual(
    snap.parts.map((p) => [p.label, p.ordinal]),
    [['Verse 1', 1], ['Chorus', 1]],
  );
  assert.match(snap.parts[0]!.first_line, /Amazing grace/);
  assert.equal(snap.fingerprint, chartSnapshotParts(CHART).fingerprint);
  assert.notEqual(snap.fingerprint, chartSnapshotParts(CHART.replace('sweet', 'dulce')).fingerprint);
});

test('matcher is fuzzy: transcribed vs typed lyrics still score high', () => {
  // Transcription drift: missing word, different casing/punctuation.
  const score = lyricSimilarity('amazing grace how sweet the sound', 'Amazing grace, how sweet the sound!');
  assert.ok(score >= 0.9, `expected near-identity, got ${score}`);
  const unrelated = lyricSimilarity('cu totul alta cantare', 'Amazing grace how sweet the sound');
  assert.ok(unrelated < ALIGN_THRESHOLD, `unrelated text must stay below threshold, got ${unrelated}`);
});

test('alignment: lyric-less → instrumental · confident → accepted · weak → proposal · none → no row', () => {
  const sections = [
    { id: 's-intro', label: 'Intro', ordinal: 1, start_s: 0, end_s: 10, start_bar: 0, end_bar: 2, variation_of: null },
    { id: 's-v1', label: 'Section A', ordinal: 1, start_s: 10, end_s: 20, start_bar: 2, end_bar: 4, variation_of: null },
    { id: 's-weak', label: 'Section B', ordinal: 1, start_s: 20, end_s: 30, start_bar: 4, end_bar: 6, variation_of: null },
    { id: 's-none', label: 'Section C', ordinal: 1, start_s: 30, end_s: 40, start_bar: 6, end_bar: 8, variation_of: null },
  ];
  const lrc = [
    { time_s: 11, text: 'Amazing grace how sweet' },
    { time_s: 15, text: 'the sound' },
    { time_s: 21, text: 'grace and other words entirely different here' },
    { time_s: 31, text: 'nimic asemanator deloc' },
  ];
  const parts = chartSnapshotParts(CHART).parts;
  const rows = alignSections({ sections, lrc, parts });

  const byId = new Map(rows.map((r) => [r.section_id, r]));
  assert.equal(byId.get('s-intro')?.is_instrumental, true, 'no lyrics in range → instrumental');
  const v1 = byId.get('s-v1');
  assert.equal(v1?.accepted, true, 'confident match drives');
  assert.equal(v1?.part_label, 'Verse 1');
  assert.equal(v1?.source, 'auto');
  const weak = byId.get('s-weak');
  assert.ok(weak, 'partial overlap yields a row');
  assert.equal(weak?.accepted, false, 'below threshold = proposal, does NOT drive');
  assert.ok((weak?.confidence ?? 1) < ALIGN_THRESHOLD);
  assert.equal(byId.has('s-none'), false, 'no overlap at all → unaligned (no row)');
});

test('unlink: untouched snapshot promotes to an editable chart', () => {
  const store = fresh();
  store.upsertLocalSong({
    ...baseSong('song-a'),
    global_song_id: 'global-1',
    link_state: 'linked',
    chordpro: '{key: A}\n[1]global chart',
    chart_source: 'snapshot',
    snapshot_parts: { parts: [], fingerprint: 'x' },
    snapshot_taken_at: NOW,
  });
  store.unlinkSong('song-a');
  const song = store.getLocalSong('song-a')!;
  assert.equal(song.link_state, 'local');
  assert.equal(song.global_song_id, null);
  assert.equal(song.chordpro, '{key: A}\n[1]global chart', 'snapshot promoted');
  assert.equal(song.chart_source, 'derived', 'editable again');
  assert.equal(song.snapshot_parts, null);
  store.close();
});

test('unlink: a chart the editor touched is restored from derived_chordpro (lossless)', () => {
  const store = fresh();
  store.upsertLocalSong({
    ...baseSong('song-b'),
    global_song_id: 'global-2',
    link_state: 'linked',
    chordpro: '{key: A}\n[1]global chart',
    chart_source: 'snapshot',
    derived_chordpro: '{key: G}\n[1]my hand-corrected chart',
    snapshot_taken_at: NOW,
  });
  store.unlinkSong('song-b');
  const song = store.getLocalSong('song-b')!;
  assert.equal(song.chordpro, '{key: G}\n[1]my hand-corrected chart');
  assert.equal(song.derived_chordpro, null);
  store.close();
});
