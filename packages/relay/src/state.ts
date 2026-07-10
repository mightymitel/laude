/**
 * Authoritative in-memory session store. The relay owns live session state;
 * everything else (clients, the Firestore mirror) derives from here.
 * Patch semantics are shared with the LocalTransport via applySessionPatch.
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_COMPANION,
  DEFAULT_CURRENT,
  DEFAULT_KEY_POLICY,
  applySessionPatch,
  type DjManifestEntry,
  type DjMode,
  type InitialSessionState,
  type SessionMember,
  type SessionPatch,
  type SessionState,
} from '@laude/session';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoids confusable chars

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

export interface CreateResult {
  session: SessionState;
  /** A prior active session of this owner that was ended (links revoked). */
  endedSessionId: string | null;
}

export class SessionStore {
  private sessions = new Map<string, SessionState>();

  /**
   * Going live is repeatable (DEC-37): every call mints a FRESH session with
   * fresh independent tokens and ends the owner's prior live one — that is
   * the Phase-1 revoke/kick. The pushed `initial` state (from the local
   * transport) becomes the relay's starting snapshot.
   */
  createForOwner(ownerId: string, initial?: InitialSessionState): CreateResult {
    const previous = this.activeByOwner(ownerId);
    if (previous) this.end(previous.id);

    const now = new Date().toISOString();
    const session: SessionState = {
      id: randomUUID(),
      ownerId,
      accessCode: generateCode(),
      presenterCode: generateCode(),
      status: 'active',
      current: { ...DEFAULT_CURRENT, ...initial?.current },
      currentSong: initial?.currentSong ?? null,
      sessionPlaylist: initial?.sessionPlaylist ?? [],
      chordStyle: initial?.chordStyle ?? 'letters',
      key_policy: initial?.key_policy ?? DEFAULT_KEY_POLICY,
      companion: { ...DEFAULT_COMPANION, ...initial?.companion },
      directives: initial?.directives ?? {},
      presenters: [],
      dj_manifest: [],
      updated_by: ownerId,
      updated_at: now,
      created_at: now,
    };
    this.sessions.set(session.id, session);
    return { session, endedSessionId: previous?.id ?? null };
  }

  /** Rehydrate one session from the mirror (relay restart with live clients). */
  restore(session: SessionState): void {
    // Roster + manifest are transient — never restored. Mirror docs written
    // before the directives field existed hydrate to an empty map.
    this.sessions.set(session.id, {
      ...session,
      directives: session.directives ?? {},
      presenters: [],
      dj_manifest: [],
    });
  }

  byId(id: string): SessionState | null {
    return this.sessions.get(id) ?? null;
  }

  activeByOwner(ownerId: string): SessionState | null {
    for (const s of this.sessions.values()) {
      if (s.ownerId === ownerId && s.status === 'active') return s;
    }
    return null;
  }

  activeByAccessCode(code: string): SessionState | null {
    const wanted = code.toUpperCase();
    for (const s of this.sessions.values()) {
      if (s.accessCode === wanted && s.status === 'active') return s;
    }
    return null;
  }

  activeByPresenterCode(code: string): SessionState | null {
    const wanted = code.toUpperCase();
    for (const s of this.sessions.values()) {
      if (s.presenterCode === wanted && s.status === 'active') return s;
    }
    return null;
  }

  /** Resolve either code; tells the caller which ROLE the link grants. */
  activeByAnyCode(code: string): { session: SessionState; role: 'presenter' | 'viewer' } | null {
    const asPresenter = this.activeByPresenterCode(code);
    if (asPresenter) return { session: asPresenter, role: 'presenter' };
    const asViewer = this.activeByAccessCode(code);
    if (asViewer) return { session: asViewer, role: 'viewer' };
    return null;
  }

  /** Apply a writer patch; returns the updated session. */
  applyPatch(id: string, patch: SessionPatch, writerId: string): SessionState | null {
    const s = this.sessions.get(id);
    if (!s || s.status !== 'active') return null;
    const next = applySessionPatch(s, patch, writerId);
    this.sessions.set(id, next);
    return next;
  }

  /** Roster join (dedupe by member id — reconnects replace the entry). */
  addMember(id: string, member: SessionMember): SessionState | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const presenters = [...s.presenters.filter((p) => p.id !== member.id), member];
    const next = { ...s, presenters };
    this.sessions.set(id, next);
    return next;
  }

  /** Roster leave; clears the DJ manifest when the leaving member was the dj. */
  removeMember(id: string, memberId: string): SessionState | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const leaving = s.presenters.find((p) => p.id === memberId);
    const next: SessionState = {
      ...s,
      presenters: s.presenters.filter((p) => p.id !== memberId),
      ...(leaving?.kind === 'dj' ? { dj_manifest: [] } : {}),
    };
    this.sessions.set(id, next);
    return next;
  }

  /** DEC-43: the DJ's mode is reflected read-only on its roster entry. */
  setDjMode(id: string, memberId: string, mode: DjMode): SessionState | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const next = {
      ...s,
      presenters: s.presenters.map((p) => (p.id === memberId && p.kind === 'dj' ? { ...p, mode } : p)),
    };
    this.sessions.set(id, next);
    return next;
  }

  setDjManifest(id: string, entries: DjManifestEntry[]): SessionState | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const next = { ...s, dj_manifest: entries };
    this.sessions.set(id, next);
    return next;
  }

  end(id: string): SessionState | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const next: SessionState = { ...s, status: 'ended', updated_at: new Date().toISOString() };
    this.sessions.set(id, next);
    return next;
  }
}

/** Public (viewer) projection: never leak the presenter credential. */
export function viewerView(session: SessionState): SessionState {
  const { presenterCode: _presenterCode, ...rest } = session;
  return rest;
}
