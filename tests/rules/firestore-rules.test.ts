/**
 * Firestore security-rules tests (WP-121) — run against the emulator via
 * `npm run test:rules` (scripts/rules-test.ts boots/reuses the emulator).
 *
 * The load-bearing assertions: liveSessions is CLOSED to clients (the relay
 * writes it with Admin creds and it carries the presenter credential),
 * playlists are owner-scoped, private songs are invisible to other accounts,
 * and there is no allow-all fallthrough anywhere.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-laude-rules',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
  // Seed as admin (rules bypassed): one private song, one live-session
  // mirror doc, one playlist owned by alice.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'songs/song-private'), {
      title: 'Private Song',
      visibility: 'private',
      ownerId: 'alice',
      libraryType: 'user',
    });
    await setDoc(doc(db, 'songs/song-public'), {
      title: 'Public Song',
      visibility: 'public',
      ownerId: 'alice',
      libraryType: 'official',
    });
    await setDoc(doc(db, 'liveSessions/sess-1'), {
      status: 'active',
      ownerId: 'alice',
      accessCode: 'AAAAAA',
      presenterCode: 'BBBBBB',
    });
    await setDoc(doc(db, 'playlists/pl-alice'), {
      ownerId: 'alice',
      name: 'Duminică',
      items: [],
    });
    await setDoc(doc(db, 'sessions/sess-alice'), {
      ownerId: 'alice',
      name: 'Seara de rugăciune',
      items: [],
    });
  });
});

after(async () => {
  await env.cleanup();
});

test('liveSessions is closed to every client — authed or not', async () => {
  const anon = env.unauthenticatedContext().firestore();
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(getDoc(doc(anon, 'liveSessions/sess-1')));
  // Even the session OWNER cannot read the mirror directly (it would leak
  // the presenter credential shape; the relay is the only reader).
  await assertFails(getDoc(doc(alice, 'liveSessions/sess-1')));
  await assertFails(setDoc(doc(alice, 'liveSessions/sess-2'), { status: 'active' }));
});

test('playlists are owner-scoped: owner full access, others none', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(alice, 'playlists/pl-alice')));
  await assertSucceeds(updateDoc(doc(alice, 'playlists/pl-alice'), { name: 'Miercuri' }));
  await assertFails(getDoc(doc(bob, 'playlists/pl-alice')));
  await assertFails(updateDoc(doc(bob, 'playlists/pl-alice'), { name: 'hijacked' }));
  await assertFails(getDoc(doc(anon, 'playlists/pl-alice')));

  await assertSucceeds(
    setDoc(doc(bob, 'playlists/pl-bob'), { ownerId: 'bob', name: 'Mine', items: [] }),
  );
  await assertFails(
    setDoc(doc(bob, 'playlists/pl-fake'), { ownerId: 'alice', name: 'Spoofed', items: [] }),
  );
});

test('private songs are invisible to other accounts; public readable by all (WP-113)', async () => {
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(getDoc(doc(bob, 'songs/song-private')));
  await assertFails(getDoc(doc(anon, 'songs/song-private')));
  await assertSucceeds(getDoc(doc(alice, 'songs/song-private')));
  await assertSucceeds(getDoc(doc(anon, 'songs/song-public')));
});

test('an authed non-owner cannot overwrite someone else\'s song (WP-114 rules half)', async () => {
  const bob = env.authenticatedContext('bob').firestore();
  await assertFails(updateDoc(doc(bob, 'songs/song-private'), { title: 'stolen' }));
  await assertFails(updateDoc(doc(bob, 'songs/song-public'), { title: 'defaced' }));
});

test('saved sessions are owner-scoped INCLUDING reads — items embed private songs (DEC-96)', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(alice, 'sessions/sess-alice')));
  await assertSucceeds(updateDoc(doc(alice, 'sessions/sess-alice'), { name: 'Vineri' }));
  await assertFails(getDoc(doc(bob, 'sessions/sess-alice')));
  await assertFails(updateDoc(doc(bob, 'sessions/sess-alice'), { name: 'hijacked' }));
  await assertFails(getDoc(doc(anon, 'sessions/sess-alice')));

  await assertSucceeds(
    setDoc(doc(bob, 'sessions/sess-bob'), { ownerId: 'bob', name: 'Mine', items: [] }),
  );
  await assertFails(
    setDoc(doc(bob, 'sessions/sess-fake'), { ownerId: 'alice', name: 'Spoofed', items: [] }),
  );
});

test('no allow-all fallthrough: unknown collections deny; sessions requires an owned doc', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  // The old allow-all sessions rule is gone: a doc without ownerId==uid denies.
  await assertFails(setDoc(doc(alice, 'sessions/main'), { anything: true }));
  await assertFails(getDoc(doc(alice, 'performances/perf-1')));
  await assertFails(setDoc(doc(alice, 'random_collection/x'), { y: 1 }));
});
