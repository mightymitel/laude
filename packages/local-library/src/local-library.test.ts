/**
 * LocalLibrary CONTRACT tests (WP-109) — written against the interface so
 * every adapter (memory now; IndexedDB in the browser; Studio SQLite later)
 * must pass the same suite.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryLocalLibrary } from './memory';
import { pinSong, removeDownload, touchRecent } from './retention';
import { chordproToEmbedded, embeddedToChordpro, type LocalLibrary, type LocalLibrarySong } from './types';

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

  test(`${name}: source_doc snapshot round-trips opaquely`, async () => {
    const lib = make();
    const snapshot = {
      id: 'g-1',
      parts: [{ type: 'pre-chorus', index: 2 }],
      arrangements: [{ id: 'a1', name: 'Official', order: ['V1', 'C1'], isDefault: true }],
      tags: ['closer'],
    };
    await lib.saveSong({ ...guestSong('snap-1'), source_doc: snapshot });
    const row = await lib.getSong('snap-1');
    assert.deepEqual(row?.source_doc, snapshot, 'stored verbatim, shape owned by the caller');
  });

  // === Retention (WP-158): pinned downloads + cached recents LRU ===

  function downloadedSong(id: string, title = `Song ${id}`): LocalLibrarySong {
    return { ...guestSong(id), title, origin: 'downloaded', global_song_id: `g-${id}`, link_state: 'linked' };
  }

  test(`${name}: recents LRU evicts oldest cached past the cap`, async () => {
    const lib = make();
    for (let i = 1; i <= 4; i++) {
      await lib.saveSong(downloadedSong(`d${i}`));
      await touchRecent(lib, `d${i}`, `2026-07-11T00:0${i}:00.000Z`, 3);
    }
    assert.equal(await lib.getSong('d1'), null, 'oldest evicted past cap 3');
    assert.ok(await lib.getSong('d2'));
    assert.ok(await lib.getSong('d4'));
    const klasses = (await lib.listRetention()).map((r) => r.klass);
    assert.deepEqual([...new Set(klasses)], ['cached']);
  });

  test(`${name}: pinned is never evicted by the recents LRU`, async () => {
    const lib = make();
    await lib.saveSong(downloadedSong('pin'));
    await pinSong(lib, 'pin', '2026-07-11T00:00:00.000Z'); // oldest timestamp of all
    for (let i = 1; i <= 3; i++) {
      await lib.saveSong(downloadedSong(`d${i}`));
      await touchRecent(lib, `d${i}`, `2026-07-11T00:0${i}:00.000Z`, 2);
    }
    assert.ok(await lib.getSong('pin'), 'pinned survives');
    assert.equal((await lib.listRetention()).find((r) => r.song_id === 'pin')?.klass, 'pinned');
    assert.equal(await lib.getSong('d1'), null, 'cached beyond cap still evicts');
  });

  test(`${name}: opening a pinned song does not demote it to cached`, async () => {
    const lib = make();
    await lib.saveSong(downloadedSong('pin2'));
    await pinSong(lib, 'pin2', '2026-07-11T00:00:00.000Z');
    await touchRecent(lib, 'pin2', '2026-07-11T01:00:00.000Z', 5);
    assert.equal((await lib.listRetention()).find((r) => r.song_id === 'pin2')?.klass, 'pinned');
  });

  test(`${name}: authored songs never enter the evictable class`, async () => {
    const lib = make();
    await lib.saveSong(guestSong('mine')); // origin 'authored'
    await touchRecent(lib, 'mine', '2026-07-11T00:00:00.000Z', 1);
    assert.deepEqual(await lib.listRetention(), [], 'no retention row for the only copy');
    assert.ok(await lib.getSong('mine'));
  });

  test(`${name}: remove-download deletes the downloaded copy but only unpins other origins`, async () => {
    const lib = make();
    await lib.saveSong(downloadedSong('dl'));
    await pinSong(lib, 'dl', '2026-07-11T00:00:00.000Z');
    await removeDownload(lib, 'dl');
    assert.equal(await lib.getSong('dl'), null);

    await lib.saveSong(guestSong('own'));
    await lib.setRetention({ song_id: 'own', klass: 'pinned', last_opened_at: '2026-07-11T00:00:00.000Z' });
    await removeDownload(lib, 'own');
    assert.ok(await lib.getSong('own'), 'authored content survives remove-download');
    assert.deepEqual(await lib.listRetention(), []);
  });
}

test('chordpro round-trip: embedded → chart container → embedded', () => {
  const embedded = {
    id: 'g-1',
    title: 'Round Trip',
    author: 'Echipa',
    defaultKey: 'D',
    parts: [
      { type: 'verse', lines: [{ text: '[1]rând unu' }, { text: 'rând [4]doi' }] },
      { type: 'chorus', lines: [{ text: '[5]refren' }] },
      { type: 'bridge', lines: [{ text: '[6m]punte' }] },
    ],
  };
  const chordpro = embeddedToChordpro(embedded);
  const back = chordproToEmbedded({
    id: 'local-x',
    global_song_id: 'g-1',
    title: 'Round Trip',
    author: 'Echipa',
    analysis_key: 'D',
    chordpro,
  });
  assert.equal(back.id, 'g-1');
  assert.equal(back.defaultKey, 'D');
  assert.deepEqual(
    back.parts.map((p) => p.type),
    ['verse', 'chorus', 'bridge'],
  );
  assert.deepEqual(
    back.parts.map((p) => p.lines.map((l) => l.text)),
    [['[1]rând unu', 'rând [4]doi'], ['[5]refren'], ['[6m]punte']],
  );
});

contractSuite('memory', () => new MemoryLocalLibrary());
// The IndexedDB adapter runs the SAME suite in a browser context; node has
// no indexedDB, so it is exercised via the web app (and later Playwright).
