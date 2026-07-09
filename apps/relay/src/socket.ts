/**
 * Socket fast path: join → snapshot, state:set → state:sync, roster +
 * DJ-manifest broadcasts. Presenter identity is per-socket: writing requires
 * having joined with the presenter code (+ a presenter declaration).
 */
import type { Server, Socket } from 'socket.io';
import type { Presenter, PresenterKind } from '@laude/song-model';
import { EVENTS, type DjManifestEntry, type SessionPatch } from '@laude/session';
import { SessionStore, viewerView } from './state';
import { mirrorSession } from './mirror';

interface SocketSession {
  sessionId: string;
  presenter: Presenter | null; // null = viewer
}

const bySocket = new Map<string, SocketSession>();

function room(sessionId: string): string {
  return `session:${sessionId}`;
}

function presenterKind(v: unknown): PresenterKind {
  return v === 'dj' || v === 'mic' ? v : 'human';
}

function asPresenter(v: unknown): Presenter | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id === '') return null;
  return {
    id: p.id,
    name: typeof p.name === 'string' && p.name !== '' ? p.name : 'Presenter',
    kind: presenterKind(p.kind),
    joined_at: new Date().toISOString(),
  };
}

export function wireSockets(io: Server, store: SessionStore): void {
  io.on('connection', (socket: Socket) => {
    socket.on(EVENTS.join, (payload: unknown) => {
      const p = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      const code = typeof p.code === 'string' ? p.code : '';
      const resolved = store.activeByAnyCode(code);
      if (!resolved) {
        socket.emit('joinError', 'Session not found or ended');
        return;
      }
      const presenter = resolved.role === 'presenter' ? asPresenter(p.presenter) : null;
      const { session } = resolved;

      bySocket.set(socket.id, { sessionId: session.id, presenter });
      void socket.join(room(session.id));

      if (presenter) {
        const updated = store.addPresenter(session.id, presenter);
        if (updated) {
          io.to(room(session.id)).emit(EVENTS.rosterChanged, updated.presenters);
          socket.emit(EVENTS.snapshot, updated);
          return;
        }
      }
      socket.emit(EVENTS.snapshot, resolved.role === 'presenter' ? session : viewerView(session));
    });

    socket.on(EVENTS.stateSet, (patch: SessionPatch) => {
      const ctx = bySocket.get(socket.id);
      if (!ctx?.presenter) return; // viewers (and unjoined sockets) cannot write
      const updated = store.applyPatch(ctx.sessionId, patch, ctx.presenter.id);
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
      if (ctx?.presenter?.kind !== 'dj') return;
      const updated = store.setDjManifest(ctx.sessionId, Array.isArray(entries) ? entries : []);
      if (!updated) return;
      io.to(room(ctx.sessionId)).emit(EVENTS.djManifestChanged, updated.dj_manifest);
    });

    const leave = () => {
      const ctx = bySocket.get(socket.id);
      if (!ctx) return;
      bySocket.delete(socket.id);
      if (ctx.presenter) {
        const updated = store.removePresenter(ctx.sessionId, ctx.presenter.id);
        if (updated) {
          io.to(room(ctx.sessionId)).emit(EVENTS.rosterChanged, updated.presenters);
          if (ctx.presenter.kind === 'dj') {
            io.to(room(ctx.sessionId)).emit(EVENTS.djManifestChanged, updated.dj_manifest);
          }
        }
      }
    };

    socket.on(EVENTS.leave, leave);
    socket.on('disconnect', leave);
  });
}
