/** Local-transport + patch-semantics tests. Run: npm test -w packages/session */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalTransport, createLocalState } from './transport';
import { WorshipSession } from './session';
import { applySessionPatch, durableSlice } from './types';
import { parsePortable, toPortable, PLAYLIST_FORMAT_VERSION } from './playlist';

const ME = { id: 'mike', name: 'Mike', kind: 'human' as const };

test('a personal session exists immediately: local transport, no links, owner role', () => {
  const session = new WorshipSession(ME);
  assert.equal(session.isLive, false);
  assert.equal(session.links, null);
  assert.equal(session.role, 'owner');
  assert.equal(session.state?.status, 'active');
  assert.equal(session.state?.accessCode, '', 'no tokens exist while solo');
});

test('local writes apply synchronously with the shared merge semantics', () => {
  const session = new WorshipSession(ME);
  let seen = 0;
  session.subscribe(() => {
    seen += 1;
  });
  session.setCurrent({ song_id: 'song-1', key: 'G' });
  session.setPlaylist([{ id: 'p1', songId: 'song-1' }]);
  session.setDirective('main', { blank: true });
  const s = session.state!;
  assert.equal(s.current.song_id, 'song-1');
  assert.equal(s.current.key, 'G');
  assert.equal(s.current.tempo_pct, 100, 'unpatched fields survive');
  assert.equal(s.sessionPlaylist.length, 1);
  assert.equal(s.directives.main?.blank, true);
  assert.equal(s.directives.main?.freeze, false, 'directive classes fill defaults');
  assert.equal(s.updated_by, 'mike');
  assert.ok(seen >= 4, 'subscribers hear every local write (incl. initial)');
});

test('local changes are never external and carry my kind', () => {
  const transport = new LocalTransport(ME);
  const changes: { external: boolean; writerKind: string | null }[] = [];
  transport.subscribe((c) => changes.push({ external: c.external, writerKind: c.writerKind }));
  transport.send({ chordStyle: 'nashville' });
  assert.equal(changes[1].external, false);
  assert.equal(changes[1].writerKind, 'human');
});

test('durableSlice carries exactly the go-live payload (no roster, no codes)', () => {
  const state = applySessionPatch(
    createLocalState(ME),
    { current: { song_id: 's' }, directives: { stage: { freeze: true } } },
    ME.id,
  );
  const slice = durableSlice(state);
  assert.deepEqual(Object.keys(slice).sort(), [
    'chordStyle',
    'companion',
    'current',
    'currentSong',
    'directives',
    'sessionPlaylist',
  ]);
  assert.equal(slice.current.song_id, 's');
  assert.equal(slice.directives.stage?.freeze, true);
});

test('portable playlist round-trips losslessly (by-value songs survive)', () => {
  const items = [
    {
      id: 'p1',
      songId: 'song-private',
      key: 'Bb',
      song: {
        id: 'song-private',
        title: 'Cantec Privat',
        author: 'Mike',
        defaultKey: 'Bb',
        parts: [
          { id: 'V1', type: 'verse', index: 0, lines: [{ text: '[1]La [4]la' }] },
          { id: 'C1', type: 'chorus', index: 1, lines: [{ text: '[5]Ref [1]ren' }] },
        ],
      },
    },
    { id: 'p2', songId: 'song-by-ref-legacy', arrangement: 'arr-default' },
  ];
  const envelope = toPortable('Duminica', items);
  assert.equal(envelope.format_version, PLAYLIST_FORMAT_VERSION);

  const roundTripped = parsePortable(JSON.parse(JSON.stringify(envelope)));
  assert.equal(roundTripped.ok, true);
  if (roundTripped.ok) {
    assert.equal(roundTripped.name, 'Duminica');
    assert.deepEqual(roundTripped.items, items, 'lossless round-trip');
  }
});

test('portable playlist parse rejects junk and future versions', () => {
  assert.equal(parsePortable('nope').ok, false);
  assert.equal(parsePortable({}).ok, false);
  assert.equal(parsePortable({ format_version: 99, songs: [] }).ok, false);
  assert.equal(parsePortable({ format_version: 1, songs: [{ nope: true }] }).ok, false);
  const badSong = parsePortable({ format_version: 1, songs: [{ songId: 's', song: { id: 's' } }] });
  assert.equal(badSong.ok, false, 'malformed by-value payload fails the import honestly');
});

test("'instrumental' is a first-class current.part value (DEC-62)", () => {
  const session = new WorshipSession(ME);
  session.setCurrent({ song_id: 'song-1', section_index: 2 });
  session.setCurrent({ section_index: 'instrumental' });
  const s = session.state!;
  assert.equal(s.current.section_index, 'instrumental');
  assert.equal(s.current.song_id, 'song-1', 'the song holds; only the part is instrumental');
  // It is STATE: the durable slice (late-join snapshot seed) carries it.
  assert.equal(durableSlice(s).current.section_index, 'instrumental');
  // And a later numeric announce replaces it cleanly.
  session.setCurrent({ section_index: 0 });
  assert.equal(session.state?.current.section_index, 0);
});

test('portable playlist v2: a v1 file naming originalKey is explicitly migrated (WP-116)', () => {
  const v1File = {
    format_version: 1,
    name: 'Old export',
    exported_at: '2026-07-09T00:00:00.000Z',
    songs: [
      {
        id: 'p1',
        songId: 'song-1',
        song: {
          id: 'song-1',
          title: 'Vechea cântare',
          originalKey: 'G', // pre-WP-111 field name
          parts: [{ id: 'V1', type: 'verse', index: 0, lines: [{ text: '[1]la' }] }],
        },
      },
    ],
  };
  const parsed = parsePortable(v1File);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.items[0]?.song?.defaultKey, 'G', 'originalKey migrated to defaultKey');
  }
  // A modern export carries v2 and defaultKey; round-trips losslessly.
  const modern = toPortable('New export', parsed.ok ? parsed.items : []);
  assert.equal(modern.format_version, 2);
  // A v2 file using the OLD field name is malformed — no silent alias.
  const badV2 = { ...v1File, format_version: 2 };
  const rejected = parsePortable(badV2);
  assert.equal(rejected.ok, false);
});
