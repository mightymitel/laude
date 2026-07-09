/**
 * LocalLibrary CONTRACT tests (WP-109) — written against the interface so
 * every adapter (memory now; IndexedDB in the browser; Studio SQLite later)
 * must pass the same suite.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryLocalLibrary } from './memory';
import type { LocalLibrary, LocalLibrarySong } from './types';

function guestSong(id: string): LocalLibrarySong {
  const now = '2026-07-09T00:00:00.000Z';
  return {
    id,
    global_song_id: null,
    link_state: 'local',
    title: 'Cântec de casă',
    author: null,
    language: 'ro',
    chordpro: '{key: G}\n{start_of_verse: Verse 1}\n[1]acasă [4]cântăm\n{end_of_verse}',
    analysis_key: 'G',
    verified: false,
    origin: 'authored',
    created_at: now,
    updated_at: now,
  };
}

function contractSuite(name: string, make: () => LocalLibrary): void {
  test(`${name}: a guest can author a song that has never been in the cloud (DEC-27)`, async () => {
    const lib = make();
    await lib.saveSong(guestSong('local-1'));
    const song = await lib.getSong('local-1');
    assert.equal(song?.global_song_id, null, 'no cloud identity — not a cache');
    assert.equal(song?.origin, 'authored');
    await lib.setSyncState({ song_id: 'local-1', state: 'local-only', synced_at: null });
    assert.equal((await lib.getSyncState('local-1'))?.state, 'local-only');
  });

  test(`${name}: promotion on sign-in is a sync-state + link transition`, async () => {
    const lib = make();
    await lib.saveSong(guestSong('local-2'));
    const song = (await lib.getSong('local-2'))!;
    await lib.saveSong({ ...song, global_song_id: 'global-9', link_state: 'linked' });
    await lib.setSyncState({ song_id: 'local-2', state: 'synced', synced_at: '2026-07-09T01:00:00.000Z' });
    assert.equal((await lib.getSong('local-2'))?.link_state, 'linked');
    assert.equal((await lib.getSyncState('local-2'))?.state, 'synced');
  });

  test(`${name}: favorites toggle and survive listing`, async () => {
    const lib = make();
    await lib.saveSong(guestSong('local-3'));
    await lib.setFavorite('local-3', true);
    assert.deepEqual(await lib.listFavorites(), ['local-3']);
    await lib.setFavorite('local-3', false);
    assert.deepEqual(await lib.listFavorites(), []);
  });

  test(`${name}: a by-value blob becomes an IMPORT, not a fourth representation`, async () => {
    const lib = make();
    const imported = await lib.importEmbedded(
      {
        id: 'global-song-x',
        title: 'Din sesiune',
        defaultKey: 'D',
        parts: [{ type: 'verse', lines: [{ text: '[1]rând din [4]sesiune' }] }],
      },
      'ro',
    );
    assert.equal(imported.origin, 'imported');
    assert.equal(imported.global_song_id, 'global-song-x', 'library identity kept');
    assert.match(imported.chordpro, /\{key: D\}/, 'blob serialized into the ONE chart container');
    assert.match(imported.chordpro, /\[1\]rând din \[4\]sesiune/);
    assert.ok(await lib.getSong(imported.id), 'row landed in the store');
  });

  test(`${name}: song_links round-trip (translation relation)`, async () => {
    const lib = make();
    await lib.saveLink({ song_id: 'a', related_song_id: 'b', relation_type: 'translation' });
    await lib.saveLink({ song_id: 'a', related_song_id: 'b', relation_type: 'translation' });
    const links = await lib.listLinks();
    assert.equal(links.length, 1, 'same pair upserts, not duplicates');
    assert.equal(links[0]?.relation_type, 'translation');
  });

  test(`${name}: delete removes the song and its satellite rows`, async () => {
    const lib = make();
    await lib.saveSong(guestSong('local-4'));
    await lib.setFavorite('local-4', true);
    await lib.setSyncState({ song_id: 'local-4', state: 'dirty', synced_at: null });
    await lib.deleteSong('local-4');
    assert.equal(await lib.getSong('local-4'), null);
    assert.deepEqual(await lib.listFavorites(), []);
    assert.equal(await lib.getSyncState('local-4'), null);
  });
}

contractSuite('memory', () => new MemoryLocalLibrary());
// The IndexedDB adapter runs the SAME suite in a browser context; node has
// no indexedDB, so it is exercised via the web app (and later Playwright).
