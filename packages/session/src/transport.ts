/**
 * Transports. A solo/personal session is the SAME session object with a
 * LocalTransport — in-memory state, no relay, no links, no network (DEC-35).
 * Going live swaps the transport; the UI never knows the difference.
 */
import type { PresenterKind } from '@laude/song-model';
import {
  DEFAULT_COMPANION,
  DEFAULT_CURRENT,
  DEFAULT_KEY_POLICY,
  applySessionPatch,
  type SessionPatch,
  type SessionRole,
  type SessionState,
} from './types';

export interface SessionChange {
  state: SessionState;
  /** True when the change came from another member (mode/demotion input). */
  external: boolean;
  /** The kind of the member who wrote the change, when known from the roster. */
  writerKind: PresenterKind | null;
}

export type Unsubscribe = () => void;

export interface SessionIdentity {
  id: string;
  name: string;
  kind: PresenterKind;
}

export interface SessionTransport {
  readonly kind: 'local' | 'relay';
  readonly role: SessionRole;
  snapshot(): SessionState | null;
  send(patch: SessionPatch): void;
  subscribe(cb: (change: SessionChange) => void): Unsubscribe;
  close(): void;
}

/** Fresh solo-session state: active, no codes, empty roster. */
export function createLocalState(me: SessionIdentity): SessionState {
  const now = new Date().toISOString();
  return {
    id: 'local',
    ownerId: me.id,
    accessCode: '',
    status: 'active',
    current: { ...DEFAULT_CURRENT },
    currentSong: null,
    sessionPlaylist: [],
    chordStyle: 'letters',
    key_policy: DEFAULT_KEY_POLICY,
    companion: { ...DEFAULT_COMPANION },
    directives: {},
    presenters: [],
    dj_manifest: [],
    updated_by: me.id,
    updated_at: now,
    created_at: now,
  };
}

export class LocalTransport implements SessionTransport {
  readonly kind = 'local' as const;
  readonly role: SessionRole = 'owner';
  private state: SessionState;
  private listeners = new Set<(change: SessionChange) => void>();

  constructor(
    private readonly me: SessionIdentity,
    seed?: SessionState,
  ) {
    this.state = seed ?? createLocalState(me);
  }

  snapshot(): SessionState {
    return this.state;
  }

  send(patch: SessionPatch): void {
    this.state = applySessionPatch(this.state, patch, this.me.id);
    const change: SessionChange = { state: this.state, external: false, writerKind: this.me.kind };
    this.listeners.forEach((fn) => fn(change));
  }

  subscribe(cb: (change: SessionChange) => void): Unsubscribe {
    this.listeners.add(cb);
    cb({ state: this.state, external: false, writerKind: null });
    return () => this.listeners.delete(cb);
  }

  close(): void {
    this.listeners.clear();
  }
}
