/**
 * @laude/session — presenter-client SDK (control tier 1 + 2).
 *
 * Multi-presenter peer model: any presenter (human, LauDJ, future mic) writes
 * the current part/key; everyone follows last-write. No leader role. The
 * `updated_by` field lets clients implement the yield rule: when a change
 * arrives from a *different* presenter, LauDJ pauses its auto-advance.
 */
import {
  Firestore,
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  COLLECTIONS,
  CompanionDirectives,
  LiveSession,
  Presenter,
  SessionCurrent,
  SessionId,
} from '@laude/song-model';

export interface SessionChange {
  session: LiveSession;
  /** True when the last write came from a presenter other than this client. */
  external: boolean;
}

export type Unsubscribe = () => void;

export const DEFAULT_SESSION_ID = 'main';

export class SessionClient {
  constructor(
    private readonly db: Firestore,
    readonly sessionId: SessionId,
    readonly presenter: Presenter,
  ) {}

  private ref() {
    return doc(this.db, COLLECTIONS.sessions, this.sessionId);
  }

  /** Join as a peer presenter; creates the session doc if missing. */
  async join(): Promise<void> {
    const snapshot = await getDoc(this.ref());
    if (!snapshot.exists()) {
      const fresh: LiveSession = {
        id: this.sessionId,
        title: 'Live',
        current: { song_id: null, section_index: 0, key: null, tempo_pct: 100, blank: false },
        presenters: [this.presenter],
        companion: { pads_on: false, pad_style: 'warm', pad_volume: 0.5, interlude: false },
        updated_by: this.presenter.id,
        updated_at: new Date().toISOString(),
      };
      await setDoc(this.ref(), fresh);
      return;
    }
    await updateDoc(this.ref(), {
      presenters: arrayUnion(this.presenter),
    });
  }

  async leave(): Promise<void> {
    await updateDoc(this.ref(), {
      presenters: arrayRemove(this.presenter),
    });
  }

  /** Write musical intent (tier 1): song / section / key / tempo / blank. */
  async setCurrent(patch: Partial<SessionCurrent>): Promise<void> {
    const fields: Record<string, unknown> = {
      updated_by: this.presenter.id,
      updated_at: new Date().toISOString(),
    };
    for (const [k, v] of Object.entries(patch)) {
      fields[`current.${k}`] = v;
    }
    await updateDoc(this.ref(), fields);
  }

  /** Write companion directives (tier 2): pad style/volume, interlude. */
  async setCompanion(patch: Partial<CompanionDirectives>): Promise<void> {
    const fields: Record<string, unknown> = {
      updated_by: this.presenter.id,
      updated_at: new Date().toISOString(),
    };
    for (const [k, v] of Object.entries(patch)) {
      fields[`companion.${k}`] = v;
    }
    await updateDoc(this.ref(), fields);
  }

  /** Realtime subscription; `external` implements the yield rule. */
  subscribe(callback: (change: SessionChange) => void): Unsubscribe {
    return onSnapshot(this.ref(), (snapshot) => {
      if (!snapshot.exists()) return;
      const session = snapshot.data() as LiveSession;
      callback({ session, external: session.updated_by !== this.presenter.id });
    });
  }
}
