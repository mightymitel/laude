/**
 * SessionClient — the presenter/viewer SDK over the stateful relay.
 * Transport: socket.io (fast path state:sync) + REST (join snapshots,
 * owner lifecycle). NO Firestore — the relay is authoritative.
 */
import { io, type Socket } from 'socket.io-client';
import type { Presenter, PresenterKind } from '@laude/song-model';
import {
  EVENTS,
  type DjManifestEntry,
  type SessionPatch,
  type SessionState,
  type StateSync,
} from './types';

export interface SessionChange {
  state: SessionState;
  /** True when the change came from another presenter (yield rule input). */
  external: boolean;
  /** The kind of the presenter who wrote the change, when known from the roster. */
  writerKind: PresenterKind | null;
}

export type Unsubscribe = () => void;

export interface ConnectOptions {
  /** Relay base URL, e.g. http://localhost:3003 */
  url: string;
  /** accessCode (viewer) or presenterCode (presenter). */
  code: string;
  /** Present to join as a presenter (roster entry + write access). */
  presenter?: { id: string; name: string; kind: PresenterKind };
}

async function restJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`session relay ${res.status}: ${body || url}`);
  }
  return (await res.json()) as T;
}

/** Owner lifecycle: start (or resume) the owner's live session. */
export function startLiveSession(url: string, idToken: string): Promise<SessionState> {
  return restJson<SessionState>(`${url}/api/sessions/live`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
}

/** Owner lifecycle: end a session. */
export async function endLiveSession(url: string, idToken: string, sessionId: string): Promise<void> {
  await restJson<{ success: boolean }>(`${url}/api/sessions/live/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

/** Snapshot fetch without a socket (link preview, SSR-ish uses). */
export function fetchSessionSnapshot(url: string, accessCode: string): Promise<SessionState> {
  return restJson<SessionState>(`${url}/api/sessions/join/${accessCode}`);
}

export class SessionClient {
  private socket: Socket;
  private state: SessionState | null = null;
  private listeners = new Set<(change: SessionChange) => void>();
  private endListeners = new Set<() => void>();

  private constructor(
    private readonly options: ConnectOptions,
    socket: Socket,
  ) {
    this.socket = socket;
  }

  /** Connect + join; resolves after the first snapshot arrives. */
  static connect(options: ConnectOptions): Promise<SessionClient> {
    return new Promise((resolve, reject) => {
      const socket = io(options.url, { transports: ['websocket', 'polling'] });
      const client = new SessionClient(options, socket);

      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`session relay not reachable at ${options.url}`));
      }, 8000);

      socket.on('connect', () => {
        socket.emit(EVENTS.join, { code: options.code, presenter: options.presenter ?? null });
      });
      socket.on(EVENTS.snapshot, (snapshot: SessionState) => {
        client.state = snapshot;
        clearTimeout(timer);
        client.emitChange(false, null);
        resolve(client);
      });
      socket.on('connect_error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.on(EVENTS.stateSync, (sync: StateSync) => client.onSync(sync));
      socket.on(EVENTS.rosterChanged, (presenters: Presenter[]) => {
        if (!client.state) return;
        client.state = { ...client.state, presenters };
        client.emitChange(false, null);
      });
      socket.on(EVENTS.djManifestChanged, (entries: DjManifestEntry[]) => {
        if (!client.state) return;
        client.state = { ...client.state, dj_manifest: entries };
        client.emitChange(false, null);
      });
      socket.on(EVENTS.end, () => {
        if (client.state) client.state = { ...client.state, status: 'ended' };
        client.endListeners.forEach((fn) => fn());
        client.emitChange(true, null);
      });
      socket.on('joinError', (message: string) => {
        clearTimeout(timer);
        socket.disconnect();
        reject(new Error(message));
      });
    });
  }

  get snapshot(): SessionState | null {
    return this.state;
  }

  get presenterId(): string | null {
    return this.options.presenter?.id ?? null;
  }

  /** Tier-1 musical intent (song/part/section/key/tempo/blank). */
  setCurrent(patch: SessionPatch['current']): void {
    this.send({ current: patch });
  }

  /** Tier-2 companion directives (pads/interlude). */
  setCompanion(patch: SessionPatch['companion']): void {
    this.send({ companion: patch });
  }

  setPlaylist(items: SessionState['sessionPlaylist']): void {
    this.send({ sessionPlaylist: items });
  }

  setChordStyle(chordStyle: string): void {
    this.send({ chordStyle });
  }

  setCurrentSong(song: SessionState['currentSong']): void {
    this.send({ currentSong: song });
  }

  /** Any combined patch in one write (one state:sync for everyone). */
  send(patch: SessionPatch): void {
    if (!this.options.presenter) throw new Error('viewers cannot write session state');
    this.socket.emit(EVENTS.stateSet, patch);
  }

  /** DJ capability manifest (presenter kind 'dj'). */
  sendManifest(entries: DjManifestEntry[]): void {
    this.socket.emit(EVENTS.djManifest, entries);
  }

  subscribe(listener: (change: SessionChange) => void): Unsubscribe {
    this.listeners.add(listener);
    if (this.state) {
      listener({ state: this.state, external: false, writerKind: null });
    }
    return () => this.listeners.delete(listener);
  }

  onEnd(listener: () => void): Unsubscribe {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  leave(): void {
    this.socket.emit(EVENTS.leave);
    this.socket.disconnect();
    this.listeners.clear();
    this.endListeners.clear();
  }

  private onSync(sync: StateSync): void {
    if (!this.state) return;
    const { patch } = sync;
    this.state = {
      ...this.state,
      ...(patch.current !== undefined ? { current: { ...this.state.current, ...patch.current } } : {}),
      ...(patch.currentSong !== undefined ? { currentSong: patch.currentSong } : {}),
      ...(patch.sessionPlaylist !== undefined ? { sessionPlaylist: patch.sessionPlaylist } : {}),
      ...(patch.chordStyle !== undefined ? { chordStyle: patch.chordStyle } : {}),
      ...(patch.companion !== undefined
        ? { companion: { ...this.state.companion, ...patch.companion } }
        : {}),
      updated_by: sync.updated_by,
      updated_at: sync.updated_at,
    };
    const external = sync.updated_by !== this.presenterId;
    const writer = this.state.presenters.find((p) => p.id === sync.updated_by);
    this.emitChange(external, writer?.kind ?? null);
  }

  private emitChange(external: boolean, writerKind: PresenterKind | null): void {
    if (!this.state) return;
    const change: SessionChange = { state: this.state, external, writerKind };
    this.listeners.forEach((fn) => fn(change));
  }
}
