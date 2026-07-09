/** Editor rules (WP-104): interpretation always, chart until link. */
import '../store/test-env'; // MUST be first — temp data dir
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { LocalStore, type LocalSongRow } from '../store';
import { DATA_DIR } from '../store/paths';
import { applyEdit } from './apply';
import { rekeySong, reviewMapRow, setChart } from './chart';

const NOW = '2026-07-09T00:00:00.000Z';
let n = 0;

const CHART = '{key: G}\n{start_of_verse: Verse 1}\n[1]la la [4]la\n{end_of_verse}';

function seeded(): { store: LocalStore; songId: string; perfId: string } {
  const store = new LocalStore(join(DATA_DIR, `editor-${++n}.db`));
  const song: LocalSongRow = {
    id: 'song-e',
    global_song_id: null,
    link_state: 'local',
    title: 'Editor Song',
    author: null,
    language: 'ro',
    chordpro: CHART,
    chart_source: 'derived',
    analysis_key: 'G',
    derived_chordpro: null,
    snapshot_parts: null,
    snapshot_taken_at: null,
    preferred_performance_id: 'perf-e',
    verified: false,
    created_at: NOW,
    updated_at: NOW,
  };
  store.upsertLocalSong(song);
  store.upsertPerformance({
    id: 'perf-e',
    local_song_id: 'song-e',
    service_id: null,
    segment_id: null,
    source_uri: null,
    start_s: 0,
    end_s: 120,
    detected_key: 'G',
    bpm: 80,
    lrc: [
      { time_s: 5, text: 'la la la' },
      { time_s: 40, text: 'na na na' },
    ],
    verified: false,
    created_at: NOW,
  });
  store.replaceSections('perf-e', [
    { id: 's1', label: 'Verse 1', ordinal: 1, start_s: 0, end_s: 60, start_bar: 0, end_bar: 15, variation_of: null },
    { id: 's2', label: 'Chorus', ordinal: 1, start_s: 60, end_s: 120, start_bar: 15, end_bar: 30, variation_of: null },
  ]);
  store.setBeatgrid('perf-e', 80, [0, 0.75, 1.5, 2.25], [0]);
  store.setChordEvents('perf-e', [{ start_s: 0, chord: 'G' }, { start_s: 30, chord: 'C' }], false);
  return { store, songId: 'song-e', perfId: 'perf-e' };
}

test('first chart edit writes derived_chordpro; later edits keep it in sync', async () => {
  const { store, songId } = seeded();
  assert.equal(store.getLocalSong(songId)?.derived_chordpro, null, 'never written before a touch');
  const edited = '{key: G}\n{start_of_verse: Verse 1}\n[1]la la [5]la\n{end_of_verse}';
  const result = await setChart(store, songId, edited);
  assert.equal(result.ok, true);
  assert.equal(result.access, 'editable');
  const song = store.getLocalSong(songId)!;
  assert.equal(song.chordpro, edited);
  assert.equal(song.derived_chordpro, edited, 'first touch promotes the kept artifact');
  store.close();
});

test('a linked chart is locked while signed out (no owner override)', async () => {
  const { store, songId } = seeded();
  store.linkSong(songId, 'global-x');
  const result = await setChart(store, songId, CHART);
  assert.equal(result.ok, false);
  assert.equal(result.access, 'locked');
  const rekey = await rekeySong(store, songId, 'A');
  assert.equal(rekey.ok, false, 're-key refuses on a locked chart');
  store.close();
});

test('setChart validates the degree grammar before writing', async () => {
  const { store, songId } = seeded();
  const result = await setChart(store, songId, '[1]chart without a head key');
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /head \{key:/);
  store.close();
});

test('re-key rotates the chart and the kept artifact together; inverse is a no-op', async () => {
  const { store, songId } = seeded();
  const edited = '{key: G}\n{start_of_verse: Verse 1}\n[1]la la [5]la\n{end_of_verse}';
  await setChart(store, songId, edited);
  await rekeySong(store, songId, 'A');
  let song = store.getLocalSong(songId)!;
  assert.equal(song.analysis_key, 'A');
  assert.match(song.chordpro, /\{key: A\}/);
  assert.match(song.chordpro, /\[b7\]la la \[4\]la/, 'degrees rotated, pitches invariant');
  assert.equal(song.derived_chordpro, song.chordpro, 'hand-corrections ride along');
  await rekeySong(store, songId, 'G');
  song = store.getLocalSong(songId)!;
  assert.equal(song.chordpro, edited, 're-key + inverse is byte-identical');
  store.close();
});

test('interpretation ops stay available regardless of link state', () => {
  const { store, perfId, songId } = seeded();
  store.linkSong(songId, 'global-x'); // chart locked — interpretation is not
  applyEdit(store, { kind: 'rename_section', performance_id: perfId, section_index: 1, label: 'Refren' });
  assert.equal(store.getSections(perfId)[1]?.label, 'Refren');

  applyEdit(store, { kind: 'split_section', performance_id: perfId, section_index: 0, at_s: 30 });
  const sections = store.getSections(perfId);
  assert.equal(sections.length, 3);
  assert.deepEqual([sections[0]?.end_s, sections[1]?.start_s], [30, 30]);
  assert.deepEqual(sections.map((s) => s.ordinal), [1, 2, 1], 'ordinals recomputed');

  applyEdit(store, { kind: 'merge_sections', performance_id: perfId, section_index: 0 });
  assert.equal(store.getSections(perfId).length, 2);

  applyEdit(store, { kind: 'shift_beatgrid', performance_id: perfId, offset_s: 0.1 });
  assert.equal(store.getBeatgrid(perfId)?.beats[0], 0.1);

  applyEdit(store, {
    kind: 'replace_chords',
    performance_id: perfId,
    from_s: 20,
    to_s: 40,
    events: [{ start_s: 25, chord: 'D' }],
  });
  assert.deepEqual(store.getChordEvents(perfId).map((e) => e.chord), ['G', 'D']);

  applyEdit(store, { kind: 'fix_lyric_line', performance_id: perfId, line_index: 0, text: 'la la la la' });
  assert.equal(store.getPerformance(perfId)?.lrc[0]?.text, 'la la la la');
  store.close();
});

test('mapping review: accept / instrumental / clear, human-sourced', () => {
  const { store, perfId } = seeded();
  reviewMapRow(store, perfId, 's1', { action: 'accept', part_label: 'Verse 1', part_ordinal: 1 });
  let rows = store.getSectionPartMap(perfId);
  assert.equal(rows[0]?.accepted, true);
  assert.equal(rows[0]?.source, 'human');
  reviewMapRow(store, perfId, 's1', { action: 'instrumental' });
  rows = store.getSectionPartMap(perfId);
  assert.equal(rows[0]?.is_instrumental, true);
  reviewMapRow(store, perfId, 's1', { action: 'clear' });
  assert.equal(store.getSectionPartMap(perfId).length, 0, 'cleared back to unaligned');
  store.close();
});
