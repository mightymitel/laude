/**
 * WorshipSession — the ONE session object the owner surface holds (DEC-35).
 * Starts on a LocalTransport (solo: same state, no relay, no links). Go Live
 * swaps to the relay transport, pushing local state as the initial snapshot
 * and minting fresh links; Stop Live swaps back, keeping the state. The UI
 * subscribes once and never knows which transport is underneath.
 */
import {
  SessionClient,
  endLiveSession,
  startLiveSession,
} from './client';
import {
  LocalTransport,
  type SessionChange,
  type SessionIdentity,
  type SessionTransport,
  type Unsubscribe,
} from './transport';
import {
  durableSlice,
  type SessionPatch,
  type SessionRole,
  type SessionState,
  type ViewportDirectives,
} from './types';

export interface GoLiveResult {
  accessCode: string;
  presenterCode: string;
}

export class WorshipSession {
  private transport: SessionTransport;
  private transportUnsub: Unsubscribe;
  private listeners = new Set<(change: SessionChange) => void>();
  private liveId: string | null = null;
  private disposed = false;

  constructor(readonly me: SessionIdentity) {
    this.transport = new LocalTransport(me);
    this.transportUnsub = this.transport.subscribe((change) => this.forward(change));
  }

  get state(): SessionState | null {
    return this.transport.snapshot();
  }

  get role(): SessionRole {
    return this.transport.role;
  }

  get isLive(): boolean {
    return this.transport.kind === 'relay';
  }

  /** Share links — null while solo (none exist). */
  get links(): GoLiveResult | null {
    const s = this.state;
    if (!this.isLive || !s || !s.accessCode) return null;
    return { accessCode: s.accessCode, presenterCode: s.presenterCode ?? '' };
  }

  subscribe(cb: (change: SessionChange) => void): Unsubscribe {
    // Revive after dispose(): React StrictMode double-invokes effects, so a
    // mount→cleanup→mount cycle disposes and immediately re-subscribes the
    // SAME instance. Local transports re-attach losslessly; a live socket
    // cannot be revived (real unmounts never resubscribe, so that's fine).
    if (this.disposed) {
      this.disposed = false;
      this.transportUnsub = this.transport.subscribe((change) => this.forward(change));
    }
    this.listeners.add(cb);
    const s = this.state;
    if (s) cb({ state: s, external: false, writerKind: null });
    return () => this.listeners.delete(cb);
  }

  send(patch: SessionPatch): void {
    this.transport.send(patch);
  }

  setCurrent(patch: SessionPatch['current']): void {
    this.send({ current: patch });
  }

  setCompanion(patch: SessionPatch['companion']): void {
    this.send({ companion: patch });
  }

  setPlaylist(items: SessionState['sessionPlaylist']): void {
    this.send({ sessionPlaylist: items });
  }

  setCurrentSong(song: SessionState['currentSong']): void {
    this.send({ currentSong: song });
  }

  setChordStyle(chordStyle: string): void {
    this.send({ chordStyle });
  }

  setDirective(targetClass: string, partial: Partial<ViewportDirectives>): void {
    this.send({ directives: { [targetClass]: partial } });
  }

  /** Flow 5: ask the connected DJ to transmit one of its LOCAL songs
   * by-value. Live sessions only — solo has no DJ to ask. */
  requestDjSong(localSongId: string): void {
    if (this.transport instanceof SessionClient) {
      this.transport.requestDjSong(localSongId);
    }
  }

  /**
   * Swap local → relay: push the local state as the relay's initial snapshot,
   * mint fresh links (repeatable — a prior live session of this owner is
   * ended, its links die: the Phase-1 revoke), join as the OWNER (authed
   * connection, no link), and keep every subscriber attached.
   */
  async goLive(url: string, idToken: string): Promise<GoLiveResult> {
    const local = this.state;
    const created = await startLiveSession(url, idToken, local ? durableSlice(local) : undefined);
    const client = await SessionClient.connect({ url, auth: idToken, member: this.me });
    this.swapTransport(client);
    this.liveId = created.id;
    return { accessCode: created.accessCode, presenterCode: created.presenterCode ?? '' };
  }

  /** Swap relay → local, keeping the last state (the session survives). */
  async stopLive(url: string, idToken: string): Promise<void> {
    const last = this.state;
    const liveId = this.liveId;
    const seedBase = new LocalTransport(this.me);
    const seed = seedBase.snapshot();
    const kept = last
      ? { ...seed, ...durableSlice(last), updated_by: this.me.id }
      : seed;
    this.swapTransport(new LocalTransport(this.me, kept));
    this.liveId = null;
    if (liveId) {
      await endLiveSession(url, idToken, liveId);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.transportUnsub();
    if (this.transport.kind === 'relay') this.transport.close();
    this.listeners.clear();
  }

  private swapTransport(next: SessionTransport): void {
    this.transportUnsub();
    this.transport.close();
    this.transport = next;
    this.transportUnsub = this.transport.subscribe((change) => this.forward(change));
  }

  private forward(change: SessionChange): void {
    this.listeners.forEach((fn) => fn(change));
  }
}
