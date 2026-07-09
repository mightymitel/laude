/** Local-transport + patch-semantics tests. Run: npm test -w packages/session */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalTransport, createLocalState } from './transport';
import { WorshipSession } from './session';
import { applySessionPatch, durableSlice } from './types';

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
