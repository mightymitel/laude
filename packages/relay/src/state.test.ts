/** SessionStore unit tests (node:test, run via `npm test -w apps/relay`). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionStore, viewerView } from './state';

test('go-live is repeatable: fresh independent tokens, prior session revoked', () => {
  const store = new SessionStore();
  const first = store.createForOwner('owner-1');
  const a = first.session;
  assert.match(a.accessCode, /^[A-Z2-9]{6}$/);
  assert.match(a.presenterCode ?? '', /^[A-Z2-9]{6}$/);
  assert.notEqual(a.accessCode, a.presenterCode, 'viewer and presenter tokens are independent');
  assert.equal(a.status, 'active');
  assert.equal(first.endedSessionId, null);

  const second = store.createForOwner('owner-1');
  assert.notEqual(second.session.id, a.id, 'every go-live mints a new session');
  assert.notEqual(second.session.accessCode, a.accessCode, 'fresh viewer token');
  assert.notEqual(second.session.presenterCode, a.presenterCode, 'fresh presenter token');
  assert.equal(second.endedSessionId, a.id, 'the prior live session is ended (links die)');
  assert.equal(store.byId(a.id)?.status, 'ended');
  assert.equal(store.activeByAccessCode(a.accessCode), null, 'old links resolve to nothing');
});

test('go-live seeds the relay from the pushed local state', () => {
  const store = new SessionStore();
  const { session } = store.createForOwner('owner-x', {
    current: { song_id: 'song-1', section_index: 2, key: 'G', tempo_pct: 100, blank: false },
    currentSong: null,
    sessionPlaylist: [{ id: 'p1', songId: 'song-1' }],
    chordStyle: 'nashville',
    companion: { pads_on: true, pad_style: 'warm', pad_volume: 0.5, interlude: false },
    directives: { main: { blank: true, freeze: false, message: null } },
  });
  assert.equal(session.current.song_id, 'song-1');
  assert.equal(session.sessionPlaylist.length, 1);
  assert.equal(session.chordStyle, 'nashville');
  assert.equal(session.companion.pads_on, true);
  assert.equal(session.directives.main?.blank, true);
});

test('code lookups resolve role and ignore ended sessions', () => {
  const store = new SessionStore();
  const s = store.createForOwner('owner-2').session;
  assert.equal(store.activeByAnyCode(s.accessCode)?.role, 'viewer');
  assert.equal(store.activeByAnyCode(s.presenterCode ?? '')?.role, 'presenter');
  assert.equal(store.activeByAnyCode(s.accessCode.toLowerCase())?.session.id, s.id, 'codes are case-insensitive');
  store.end(s.id);
  assert.equal(store.activeByAnyCode(s.accessCode), null);
});

test('applyPatch merges deep fields and stamps the writer', () => {
  const store = new SessionStore();
  const s = store.createForOwner('owner-3').session;
  const updated = store.applyPatch(s.id, { current: { song_id: 'song-x', key: 'G' } }, 'presenter-1');
  assert.ok(updated);
  assert.equal(updated.current.song_id, 'song-x');
  assert.equal(updated.current.key, 'G');
  assert.equal(updated.current.tempo_pct, 100, 'unpatched fields survive');
  assert.equal(updated.updated_by, 'presenter-1');

  const companion = store.applyPatch(s.id, { companion: { pads_on: true } }, 'presenter-1');
  assert.equal(companion?.companion.pads_on, true);
  assert.equal(companion?.companion.pad_style, 'warm');

  store.end(s.id);
  assert.equal(store.applyPatch(s.id, { chordStyle: 'nashville' }, 'p'), null, 'ended sessions reject writes');
});

test('roster dedupes by member id; dj leave clears the manifest; mode reflects', () => {
  const store = new SessionStore();
  const s = store.createForOwner('owner-4').session;
  const dj = { id: 'dj-1', name: 'LauDJ', kind: 'dj' as const, role: 'presenter' as const, joined_at: 'now' };
  store.addMember(s.id, dj);
  store.addMember(s.id, { ...dj, joined_at: 'later' });
  assert.equal(store.byId(s.id)?.presenters.length, 1, 'reconnects replace, not duplicate');

  const viewer = { id: 'v-1', name: 'PianoBob', kind: 'human' as const, role: 'viewer' as const, joined_at: 'now' };
  store.addMember(s.id, viewer);
  assert.equal(store.byId(s.id)?.presenters.length, 2, 'viewers are on the roster too');

  store.setDjMode(s.id, 'dj-1', 'playback');
  assert.equal(store.byId(s.id)?.presenters.find((p) => p.id === 'dj-1')?.mode, 'playback');
  store.setDjMode(s.id, 'v-1', 'playback');
  assert.equal(store.byId(s.id)?.presenters.find((p) => p.id === 'v-1')?.mode, undefined, 'mode only sticks to djs');

  store.setDjManifest(s.id, [
    { song_id: null, local_song_id: 'l1', title: 'T', key: 'C', bpm: 100, has_stems: false },
  ]);
  assert.equal(store.byId(s.id)?.dj_manifest.length, 1);

  const after = store.removeMember(s.id, 'dj-1');
  assert.equal(after?.presenters.length, 1);
  assert.equal(after?.dj_manifest.length, 0, 'manifest is transient with the dj');
});

test('viewerView never leaks the presenter credential', () => {
  const store = new SessionStore();
  const s = store.createForOwner('owner-5').session;
  assert.equal('presenterCode' in viewerView(s), false);
  assert.equal(viewerView(s).accessCode, s.accessCode);
});
