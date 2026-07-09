/**
 * Authoritative in-memory session store. The relay owns live session state;
 * everything else (clients, the Firestore mirror) derives from here.
 */
import { randomUUID } from 'node:crypto';
import type { Presenter } from '@laude/song-model';
import {
  DEFAULT_COMPANION,
  DEFAULT_CURRENT,
  type DjManifestEntry,
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

export class SessionStore {
  private sessions = new Map<string, SessionState>();

  /** Reuse the owner's active session or mint a fresh one (one per owner). */
  createForOwner(ownerId: string): SessionState {
    const existing = this.activeByOwner(ownerId);
    if (existing) return existing;
    const now = new Date().toISOString();
    const session: SessionState = {
      id: randomUUID(),
      ownerId,
      accessCode: generateCode(),
      presenterCode: generateCode(),
      status: 'active',
      current: { ...DEFAULT_CURRENT },
      currentSong: null,
      sessionPlaylist: [],
      chordStyle: 'letters',
      companion: { ...DEFAULT_COMPANION },
      presenters: [],
      dj_manifest: [],
      updated_by: ownerId,
      updated_at: now,
      created_at: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Rehydrate one session from the mirror (relay restart with live clients). */
  restore(session: SessionState): void {
    // Roster + manifest are transient — never restored.
    this.sessions.set(session.id, { ...session, presenters: [], dj_manifest: [] });
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

  /** Resolve either code; tells the caller which role it grants. */
  activeByAnyCode(code: string): { session: SessionState; role: 'presenter' | 'viewer' } | null {
    const asPresenter = this.activeByPresenterCode(code);
    if (asPresenter) return { session: asPresenter, role: 'presenter' };
    const asViewer = this.activeByAccessCode(code);
    if (asViewer) return { session: asViewer, role: 'viewer' };
    return null;
  }

  /** Apply a presenter patch; returns the updated session. */
  applyPatch(id: string, patch: SessionPatch, writerId: string): SessionState | null {
    const s = this.sessions.get(id);
    if (!s || s.status !== 'active') return null;
    const next: SessionState = {
      ...s,
      ...(patch.current !== undefined ? { current: { ...s.current, ...patch.current } } : {}),
      ...(patch.currentSong !== undefined ? { currentSong: patch.currentSong } : {}),
      ...(patch.sessionPlaylist !== undefined ? { sessionPlaylist: patch.sessionPlaylist } : {}),
      ...(patch.chordStyle !== undefined ? { chordStyle: patch.chordStyle } : {}),
      ...(patch.companion !== undefined ? { companion: { ...s.companion, ...patch.companion } } : {}),
      updated_by: writerId,
      updated_at: new Date().toISOString(),
    };
    this.sessions.set(id, next);
    return next;
  }

  /** Roster join (dedupe by presenter id — reconnects replace the entry). */
  addPresenter(id: string, presenter: Presenter): SessionState | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const presenters = [...s.presenters.filter((p) => p.id !== presenter.id), presenter];
    const next = { ...s, presenters };
    this.sessions.set(id, next);
    return next;
  }

  /** Roster leave; clears the DJ manifest when the leaving presenter was the dj. */
  removePresenter(id: string, presenterId: string): SessionState | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    const leaving = s.presenters.find((p) => p.id === presenterId);
    const next: SessionState = {
      ...s,
      presenters: s.presenters.filter((p) => p.id !== presenterId),
      ...(leaving?.kind === 'dj' ? { dj_manifest: [] } : {}),
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
