/**
 * Relay module integration (WP-95/99): LAN-mode boot with ZERO adapters
 * (no Firebase anywhere), REST + socket against a real ephemeral server,
 * and the protocol handshake.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { EVENTS, SESSION_PROTOCOL_VERSION, type SnapshotPayload } from '@laude/session';
import { createRelay } from './index';

let baseUrl = '';
let httpServer: ReturnType<typeof createServer>;
let io: SocketServer;

before(async () => {
  const app = express();
  app.use(express.json());
  const relay = createRelay(); // LAN mode: no verifyOwnerToken, no mirror
  app.use('/api/sessions', relay.router);
  httpServer = createServer(app);
  io = new SocketServer(httpServer);
  relay.attach(io);
  assert.equal(await relay.rehydrate(), 0, 'no mirror → nothing to rehydrate');
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => {
  io.close();
  httpServer.close();
});

function connect(): ClientSocket {
  return ioClient(baseUrl, { transports: ['websocket'] });
}

async function goLive(): Promise<{ id: string; accessCode: string; presenterCode: string }> {
  const res = await fetch(`${baseUrl}/api/sessions/live`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer lan-owner' },
    body: '{}',
  });
  assert.equal(res.status, 201);
  return (await res.json()) as { id: string; accessCode: string; presenterCode: string };
}

test('LAN mode: the Bearer token IS the owner id; links mint without Firebase', async () => {
  const session = await goLive();
  assert.match(session.accessCode, /^[A-Z2-9]{6}$/);
  assert.match(session.presenterCode, /^[A-Z2-9]{6}$/);

  const join = await fetch(`${baseUrl}/api/sessions/join/${session.accessCode}`);
  assert.equal(join.status, 200);
  const view = (await join.json()) as Record<string, unknown>;
  assert.equal('presenterCode' in view && view.presenterCode !== undefined, false,
    'viewer snapshot never carries the presenter credential');
});

test('handshake: an old client is refused with an actionable message', async () => {
  const session = await goLive();
  const socket = connect();
  const message = await new Promise<string>((resolve, reject) => {
    socket.on('connect', () => {
      socket.emit(EVENTS.join, {
        code: session.presenterCode,
        member: { id: 'old-laudj', name: 'Old LauDJ', kind: 'dj' },
        // no protocol field: a pre-handshake client
      });
    });
    socket.on('joinError', resolve);
    socket.on(EVENTS.snapshot, () => reject(new Error('must not join')));
    setTimeout(() => reject(new Error('no response')), 4000);
  });
  socket.disconnect();
  assert.match(message, /update the app/i);
});

test('handshake: a matching client joins and gets its snapshot + role', async () => {
  const session = await goLive();
  const socket = connect();
  const payload = await new Promise<SnapshotPayload>((resolve, reject) => {
    socket.on('connect', () => {
      socket.emit(EVENTS.join, {
        code: session.presenterCode,
        member: { id: 'p1', name: 'Prezentarița', kind: 'human' },
        protocol: SESSION_PROTOCOL_VERSION,
      });
    });
    socket.on(EVENTS.snapshot, resolve);
    socket.on('joinError', (m: string) => reject(new Error(m)));
    setTimeout(() => reject(new Error('no snapshot')), 4000);
  });
  socket.disconnect();
  assert.equal(payload.role, 'presenter');
  assert.equal(payload.state.id, session.id);
});

test('a newer client than the server is told the SERVER needs updating', async () => {
  const session = await goLive();
  const socket = connect();
  const message = await new Promise<string>((resolve, reject) => {
    socket.on('connect', () => {
      socket.emit(EVENTS.join, {
        code: session.presenterCode,
        member: { id: 'future', name: 'Future App', kind: 'human' },
        protocol: SESSION_PROTOCOL_VERSION + 1,
      });
    });
    socket.on('joinError', resolve);
    setTimeout(() => reject(new Error('no response')), 4000);
  });
  socket.disconnect();
  assert.match(message, /server needs updating/i);
});

test('dj:request fans out to the room from writers; viewer emits are dropped', async () => {
  const session = await goLive();
  const joinAs = (code: string, id: string, kind: string): Promise<ClientSocket> =>
    new Promise((resolve, reject) => {
      const socket = connect();
      socket.on('connect', () => {
        socket.emit(EVENTS.join, {
          code,
          member: { id, name: id, kind },
          protocol: SESSION_PROTOCOL_VERSION,
        });
      });
      socket.on(EVENTS.snapshot, () => resolve(socket));
      socket.on('joinError', (m: string) => reject(new Error(m)));
      setTimeout(() => reject(new Error('join timeout')), 4000);
    });

  const dj = await joinAs(session.presenterCode, 'dj-1', 'dj');
  const presenter = await joinAs(session.presenterCode, 'p-1', 'human');
  const viewer = await joinAs(session.accessCode, 'v-1', 'human');

  const received = new Promise<string>((resolve) => {
    dj.on(EVENTS.djRequest, (payload: { local_song_id: string }) =>
      resolve(payload.local_song_id),
    );
  });
  // A viewer's request must be dropped server-side…
  viewer.emit(EVENTS.djRequest, { local_song_id: 'from-viewer' });
  await new Promise((r) => setTimeout(r, 300));
  // …a presenter's goes through.
  presenter.emit(EVENTS.djRequest, { local_song_id: 'song-local-x' });
  const got = await received;
  assert.equal(got, 'song-local-x');

  dj.disconnect();
  presenter.disconnect();
  viewer.disconnect();
});

test('REST write path (DEC-105): access code looks up, presenter token authorizes', async () => {
  const session = await goLive();
  const url = `${baseUrl}/api/sessions/update/${session.accessCode}`;
  const body = JSON.stringify({ current: { song_id: 'song-x', section_index: 1 } });
  const headers = { 'Content-Type': 'application/json' };

  // No token → 401. The access code alone was never a credential.
  const noToken = await fetch(url, { method: 'PUT', headers, body });
  assert.equal(noToken.status, 401);

  // The viewer/access code as a token → 403 (it grants no write role).
  const wrongToken = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, Authorization: `Bearer ${session.accessCode}` },
    body,
  });
  assert.equal(wrongToken.status, 403);

  // The presenter token writes, and the write is visible to readers.
  const ok = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, Authorization: `Bearer ${session.presenterCode}` },
    body,
  });
  assert.equal(ok.status, 200);

  const now = await fetch(`${baseUrl}/api/sessions/now-playing/${session.accessCode}`);
  assert.equal(now.status, 200);
  const nowBody = (await now.json()) as {
    song: unknown;
    current: { song_id: string | null; section_index: number | 'instrumental' };
    directives: Record<string, unknown>;
    updated_at: string;
  };
  assert.equal(nowBody.current.song_id, 'song-x');
  assert.equal(nowBody.current.section_index, 1);
  assert.ok(nowBody.directives, 'directives ride in the now-playing payload');
});

test('GET /playlist serves the session playlist to non-socket readers (DEC-105)', async () => {
  const session = await goLive();
  const items = [
    { id: 'i1', songId: 's1', key: 'G', song: { id: 's1', title: 'Prima', defaultKey: 'G', parts: [] } },
  ];
  const write = await fetch(`${baseUrl}/api/sessions/update/${session.accessCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.presenterCode}` },
    body: JSON.stringify({ sessionPlaylist: items }),
  });
  assert.equal(write.status, 200);

  const res = await fetch(`${baseUrl}/api/sessions/playlist/${session.accessCode}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { playlist: { songId: string }[] };
  assert.equal(body.playlist.length, 1);
  assert.equal(body.playlist[0]?.songId, 's1');

  // An ended session's codes die with it.
  const owner = { 'Content-Type': 'application/json', Authorization: 'Bearer lan-owner' };
  const bySession = await fetch(`${baseUrl}/api/sessions/live/${(session as { id: string }).id}`, {
    method: 'DELETE',
    headers: owner,
  });
  assert.equal(bySession.status, 200);
  const gone = await fetch(`${baseUrl}/api/sessions/now-playing/${session.accessCode}`);
  assert.equal(gone.status, 404);
});
