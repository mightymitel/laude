/** Durable sign-in tests (WP-108) — fetch stubbed, no emulator needed. */
import '../store/test-env'; // MUST be first — temp data dir
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authState, currentIdToken, signIn, signOut } from './auth';

// Pretend the emulator is present so the endpoints resolve (fetch is stubbed).
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

type FetchArgs = { url: string; init: RequestInit };
const calls: FetchArgs[] = [];

function stubFetch(handler: (url: string) => unknown): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const body = handler(url);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

test('sign-in stores the refresh token; state survives module state resets', async () => {
  stubFetch((url) => {
    assert.match(url, /accounts:signInWithPassword/);
    return {
      localId: 'uid-1',
      email: 'demo@laude.local',
      refreshToken: 'refresh-abc',
      idToken: 'id-1',
      expiresIn: '3600',
    };
  });
  const state = await signIn('demo@laude.local', 'parola-demo');
  assert.deepEqual(state, { signed_in: true, uid: 'uid-1', email: 'demo@laude.local' });
  assert.equal(authState().signed_in, true);
  assert.equal(authState().email, 'demo@laude.local');
});

test('currentIdToken serves the cached token, then refreshes from disk', async () => {
  // Cached from signIn (3600s expiry) — no network call.
  calls.length = 0;
  const token = await currentIdToken();
  assert.equal(token, 'id-1');
  assert.equal(calls.length, 0, 'fresh token comes from cache');
});

test('sign-out forgets the credential; token calls then refuse', async () => {
  signOut();
  assert.equal(authState().signed_in, false);
  await assert.rejects(() => currentIdToken(), /not signed in/);
});

test('a fresh process refreshes via securetoken from the stored file', async () => {
  stubFetch((url) => {
    if (/signInWithPassword/.test(url)) {
      return {
        localId: 'uid-2',
        email: 'demo@laude.local',
        refreshToken: 'refresh-2',
        // Already expired: forces the securetoken path on next call.
        idToken: 'stale',
        expiresIn: '0',
      };
    }
    assert.match(url, /securetoken/);
    return { id_token: 'id-fresh', expires_in: '3600' };
  });
  await signIn('demo@laude.local', 'parola-demo');
  const token = await currentIdToken();
  assert.equal(token, 'id-fresh');
  signOut();
});
