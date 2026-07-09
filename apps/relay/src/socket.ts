/**
 * Socket fast path: join → snapshot(+your role), state:set → state:sync,
 * roster + DJ-manifest/mode broadcasts. ROLE is resolved from how you joined
 * (DEC-36/37): an auth token proving you're the session's owner → owner; the
 * presenter code → presenter; the viewer code → viewer. TYPE (human/dj/mic)
 * is self-declared. Writes are enforced by role, server-side.
 */
import type { Server, Socket } from 'socket.io';
import type { PresenterKind } from '@laude/song-model';
import {
  EVENTS,
  type DjManifestEntry,
  type DjMode,
  type SessionMember,
  type SessionPatch,
  type SessionRole,
  type SessionState,
} from '@laude/session';
import { SessionStore, viewerView } from './state';
import { ownerIdFromToken } from './firebase';
import { mirrorSession } from './mirror';

interface SocketContext {
  sessionId: string;
  member: SessionMember;
}

const bySocket = new Map<string, SocketContext>();

function room(sessionId: string): string {
  return `session:${sessionId}`;
}

function memberKind(v: unknown): PresenterKind {
  return v === 'dj' || v === 'mic' ? v : 'human';
}

function identityOf(v: unknown): { id: string; name: string; kind: PresenterKind } | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id === '') return null;
  return {
    id: p.id,
    name: typeof p.name === 'string' && p.name !== '' ? p.name : 'Guest',
    kind: memberKind(p.kind),
  };
}

async function resolveJoin(
  store: SessionStore,
  code: string | null,
  auth: string | null,
): Promise<{ session: SessionState; role: SessionRole } | null> {
  if (auth) {
    const ownerId = await ownerIdFromToken(auth);
    if (ownerId) {
      const session = store.activeByOwner(ownerId);
      if (session) return { session, role: 'owner' };
    }
  }
  if (code) return store.activeByAnyCode(code);
  return null;
}

export function wireSockets(io: Server, store: SessionStore): void {
  io.on('connection', (socket: Socket) => {
    socket.on(EVENTS.join, (payload: unknown) => {
      const p = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const code = typeof p.code === 'string' && p.code !== '' ? p.code : null;
      const auth = typeof p.auth === 'string' && p.auth !== '' ? p.auth : null;
      const identity = identityOf(p.member);
      if (!identity) {
        socket.emit('joinError', 'A member identity (id/name/kind) is required');
        return;
      }

      void resolveJoin(store, code, auth).then((resolved) => {
        if (!resolved) {
          socket.emit('joinError', 'Session not found or ended');
          return;
        }
        const member: SessionMember = {
          ...identity,
          role: resolved.role,
          joined_at: new Date().toISOString(),
        };

        bySocket.set(socket.id, { sessionId: resolved.session.id, member });
        void socket.join(room(resolved.session.id));

        // Everyone — viewers included — is on the roster (role × type).
        const updated = store.addMember(resolved.session.id, member) ?? resolved.session;
        io.to(room(resolved.session.id)).emit(EVENTS.rosterChanged, updated.presenters);
        socket.emit(EVENTS.snapshot, {
          state: member.role === 'viewer' ? viewerView(updated) : updated,
          role: member.role,
        });
      });
    });

    socket.on(EVENTS.stateSet, (patch: SessionPatch) => {
      const ctx = bySocket.get(socket.id);
      if (!ctx) return;
      if (ctx.member.role === 'viewer') return; // enforced server-side, not just UI
      const updated = store.applyPatch(ctx.sessionId, patch, ctx.member.id);
      if (!updated) return;
      io.to(room(ctx.sessionId)).emit(EVENTS.stateSync, {
        patch,
        updated_by: updated.updated_by,
        updated_at: updated.updated_at,
      });
      mirrorSession(updated);
    });

    socket.on(EVENTS.djManifest, (entries: DjManifestEntry[]) => {
      const ctx = bySocket.get(socket.id);
      if (ctx?.member.kind !== 'dj') return;
      const updated = store.setDjManifest(ctx.sessionId, Array.isArray(entries) ? entries : []);
      if (!updated) return;
      io.to(room(ctx.sessionId)).emit(EVENTS.djManifestChanged, updated.dj_manifest);
    });

    socket.on(EVENTS.djMode, (mode: unknown) => {
      const ctx = bySocket.get(socket.id);
      if (ctx?.member.kind !== 'dj') return;
      const parsed: DjMode = mode === 'playback' ? 'playback' : 'companion';
      const updated = store.setDjMode(ctx.sessionId, ctx.member.id, parsed);
      if (!updated) return;
      io.to(room(ctx.sessionId)).emit(EVENTS.rosterChanged, updated.presenters);
    });

    const leave = () => {
      const ctx = bySocket.get(socket.id);
      if (!ctx) return;
      bySocket.delete(socket.id);
      const updated = store.removeMember(ctx.sessionId, ctx.member.id);
      if (updated) {
        io.to(room(ctx.sessionId)).emit(EVENTS.rosterChanged, updated.presenters);
        if (ctx.member.kind === 'dj') {
          io.to(room(ctx.sessionId)).emit(EVENTS.djManifestChanged, updated.dj_manifest);
        }
      }
    };

    socket.on(EVENTS.leave, leave);
    socket.on('disconnect', leave);
  });
}
