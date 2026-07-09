/** SessionStore unit tests (node:test, run via `npm test -w apps/relay`). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionStore, viewerView } from './state';

test('createForOwner mints codes and reuses the active session', () => {
  const store = new SessionStore();
  const a = store.createForOwner('owner-1');
  assert.match(a.accessCode, /^[A-Z2-9]{6}$/);
  assert.match(a.presenterCode ?? '', /^[A-Z2-9]{6}$/);
  assert.notEqual(a.accessCode, a.presenterCode);
  assert.equal(a.status, 'active');

  const again = store.createForOwner('owner-1');
  assert.equal(again.id, a.id, 'one active session per owner');

  store.end(a.id);
  const fresh = store.createForOwner('owner-1');
  assert.notEqual(fresh.id, a.id, 'ended sessions are not reused');
});

test('code lookups resolve role and ignore ended sessions', () => {
  const store = new SessionStore();
  const s = store.createForOwner('owner-2');
  assert.equal(store.activeByAnyCode(s.accessCode)?.role, 'viewer');
  assert.equal(store.activeByAnyCode(s.presenterCode ?? '')?.role, 'presenter');
  assert.equal(store.activeByAnyCode(s.accessCode.toLowerCase())?.session.id, s.id, 'codes are case-insensitive');
  store.end(s.id);
  assert.equal(store.activeByAnyCode(s.accessCode), null);
});

test('applyPatch merges deep fields and stamps the writer', () => {
  const store = new SessionStore();
  const s = store.createForOwner('owner-3');
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

test('roster dedupes by presenter id; dj leave clears the manifest', () => {
  const store = new SessionStore();
  const s = store.createForOwner('owner-4');
  const dj = { id: 'dj-1', name: 'LauDJ', kind: 'dj' as const, joined_at: 'now' };
  store.addPresenter(s.id, dj);
  store.addPresenter(s.id, { ...dj, joined_at: 'later' });
  assert.equal(store.byId(s.id)?.presenters.length, 1, 'reconnects replace, not duplicate');

  store.setDjManifest(s.id, [
    { song_id: null, local_song_id: 'l1', title: 'T', key: 'C', bpm: 100, has_stems: false },
  ]);
  assert.equal(store.byId(s.id)?.dj_manifest.length, 1);

  const after = store.removePresenter(s.id, 'dj-1');
  assert.equal(after?.presenters.length, 0);
  assert.equal(after?.dj_manifest.length, 0, 'manifest is transient with the dj');
});

test('viewerView never leaks the presenter credential', () => {
  const store = new SessionStore();
  const s = store.createForOwner('owner-5');
  assert.equal('presenterCode' in viewerView(s), false);
  assert.equal(viewerView(s).accessCode, s.accessCode);
});
