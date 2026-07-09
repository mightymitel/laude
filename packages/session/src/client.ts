/**
 * SessionClient — the relay transport (socket.io fast path + REST). One
 * client per joined connection; the resolved ROLE comes back with the join
 * snapshot (owner via auth, presenter/viewer via which code was used).
 */
import { io, type Socket } from 'socket.io-client';
import {
  EVENTS,
  applySessionPatch,
  type DjManifestEntry,
  type DjMode,
  type InitialSessionState,
  type SessionMember,
  type SessionPatch,
  type SessionRole,
  type SessionState,
  type SnapshotPayload,
  type StateSync,
  SESSION_PROTOCOL_VERSION,
} from './types';
import type { SessionChange, SessionIdentity, SessionTransport, Unsubscribe } from './transport';

export interface ConnectOptions {
  /** Relay base URL, e.g. http://localhost:3003 */
  url: string;
  /** accessCode (viewer) or presenterCode (presenter). Omit for owner joins. */
  code?: string;
  /** Firebase ID token (or LAN-mode owner id) — resolves the owner role. */
  auth?: string;
  /** Who you are (self-declared type; role is resolved server-side). */
  member: SessionIdentity;
}

async function restJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`session relay ${res.status}: ${body || url}`);
  }
  return (await res.json()) as T;
}

/** Owner lifecycle: go live. Repeatable — every call ends the owner's prior
 * live session (old links die) and mints fresh independent tokens. The local
 * session's state rides along as the relay's initial snapshot. */
export function startLiveSession(
  url: string,
  idToken: string,
  initial?: InitialSessionState,
): Promise<SessionState> {
  return restJson<SessionState>(`${url}/api/sessions/live`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(initial ? { initial } : {}),
  });
}

/** Owner lifecycle: end a live session (links die; the local session object survives client-side). */
export async function endLiveSession(url: string, idToken: string, sessionId: string): Promise<void> {
  await restJson<{ success: boolean }>(`${url}/api/sessions/live/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

/** Snapshot fetch without a socket (link preview, non-socket clients). */
export function fetchSessionSnapshot(url: string, accessCode: string): Promise<SessionState> {
  return restJson<SessionState>(`${url}/api/sessions/join/${accessCode}`);
}

export class SessionClient implements SessionTransport {
  readonly kind = 'relay' as const;
  private socket: Socket;
  private state: SessionState | null = null;
  private myRole: SessionRole = 'viewer';
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
        socket.emit(EVENTS.join, {
          code: options.code ?? null,
          auth: options.auth ?? null,
          member: options.member,
          protocol: SESSION_PROTOCOL_VERSION,
        });
      });
      socket.on(EVENTS.snapshot, (payload: SnapshotPayload) => {
        client.state = payload.state;
        client.myRole = payload.role;
        clearTimeout(timer);
        client.emitChange(false, null);
        resolve(client);
      });
      socket.on('connect_error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.on(EVENTS.stateSync, (sync: StateSync) => client.onSync(sync));
      socket.on(EVENTS.rosterChanged, (presenters: SessionMember[]) => {
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

  get role(): SessionRole {
    return this.myRole;
  }

  snapshot(): SessionState | null {
    return this.state;
  }

  get memberId(): string {
    return this.options.member.id;
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

  /** Viewport directive merge for one target class (owner/presenter). */
  setDirective(targetClass: string, partial: Partial<SessionState['directives'][string]>): void {
    this.send({ directives: { [targetClass]: partial } });
  }

  /** Any combined patch in one write (one state:sync for everyone). */
  send(patch: SessionPatch): void {
    if (this.myRole === 'viewer') throw new Error('viewers cannot write session state');
    this.socket.emit(EVENTS.stateSet, patch);
  }

  /** DJ capability manifest (kind 'dj'). */
  sendManifest(entries: DjManifestEntry[]): void {
    this.socket.emit(EVENTS.djManifest, entries);
  }

  /** DJ mode reflection (read-only for everyone else — DEC-43). */
  sendMode(mode: DjMode): void {
    this.socket.emit(EVENTS.djMode, mode);
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

  close(): void {
    this.leave();
  }

  private onSync(sync: StateSync): void {
    if (!this.state) return;
    // Same merge the relay applied — one shared implementation, no drift.
    this.state = applySessionPatch(this.state, sync.patch, sync.updated_by, sync.updated_at);
    const external = sync.updated_by !== this.options.member.id;
    const writer = this.state.presenters.find((p) => p.id === sync.updated_by);
    this.emitChange(external, writer?.kind ?? null);
  }

  private emitChange(external: boolean, writerKind: SessionChange['writerKind']): void {
    if (!this.state) return;
    const change: SessionChange = { state: this.state, external, writerKind };
    this.listeners.forEach((fn) => fn(change));
  }
}
