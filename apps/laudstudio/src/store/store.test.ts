/** LocalStore roundtrip tests (node:test, run via `npm test -w apps/laudstudio`). */
import './test-env'; // MUST be first — points the store at a temp data dir
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LocalStore } from './index';
import { DATA_DIR } from './paths';

const NOW = '2026-07-09T00:00:00.000Z';
let counter = 0;

function freshStore(): LocalStore {
  counter += 1;
  return new LocalStore(join(DATA_DIR, `test-${counter}.db`));
}

function seedSong(store: LocalStore, id = 'song-test'): void {
  store.upsertLocalSong({
    id,
    global_song_id: null,
    title: 'Test Song',
    language: 'ro',
    original_key: 'G',
    default_bpm: 80,
    preferred_performance_id: 'perf-1',
    verified: false,
    created_at: NOW,
  });
  store.upsertPerformance({
    id: 'perf-1',
    local_song_id: id,
    service_id: null,
    youtube_id: 'yt123',
    start_s: 0,
    end_s: 200,
    key: 'A',
    bpm: 82,
    chordpro: '{title: Test Song}',
    lrc: [{ time_s: 1, text: 'la la' }],
    verified: false,
    created_at: NOW,
  });
  store.replaceSections('perf-1', [
    { label: 'Verse 1', start_s: 0, end_s: 100, start_bar: 0, end_bar: 25 },
    { label: 'Chorus', start_s: 100, end_s: 200, start_bar: 25, end_bar: 50 },
  ]);
  store.setBeatgrid('perf-1', 82, [0, 0.7, 1.4], [0]);
  store.setChords('perf-1', [{ start_s: 0, chord: 'A' }, { start_s: 2, chord: 'D' }], false);
}

test('catalog reflects song + preferred performance + sections', () => {
  const store = freshStore();
  seedSong(store);
  const catalog = store.listCatalog();
  assert.equal(catalog.length, 1);
  const entry = catalog[0];
  assert.equal(entry.song_id, 'song-test', 'unlinked songs expose the local id');
  assert.equal(entry.linked, false);
  assert.equal(entry.performance_id, 'perf-1');
  assert.equal(entry.key, 'A', 'performance key wins over the song key');
  assert.equal(entry.duration_s, 200);
  assert.deepEqual(entry.sections.map((s) => s.label), ['Verse 1', 'Chorus']);
  assert.deepEqual(entry.stems, [], 'no audio registered → no stems');
  store.close();
});

test('performance detail carries grid, chords, lrc and chart', () => {
  const store = freshStore();
  seedSong(store);
  const detail = store.getPerformanceDetail('perf-1');
  assert.ok(detail);
  assert.equal(detail.beats.length, 3);
  assert.deepEqual(detail.downbeats, [0]);
  assert.equal(detail.chords.length, 2);
  assert.equal(detail.lrc[0]?.text, 'la la');
  assert.equal(detail.chordpro, '{title: Test Song}');
  assert.equal(detail.sections.length, 2);
  store.close();
});

test('registerAudio drives stems/key_variants/mixdown inventory', () => {
  const store = freshStore();
  seedSong(store);
  // Fake audio files inside the (temp) data dir — paths are stored relative to it.
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
  const store = freshStore();
  seedSong(store);
  store.linkSong('song-test', 'global-42');
  const entry = store.listCatalog()[0];
  assert.equal(entry.linked, true);
  assert.equal(entry.song_id, 'global-42');
  assert.equal(entry.local_song_id, 'song-test');
  store.close();
});
