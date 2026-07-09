/**
 * @laude/relay — the session relay as a mountable module (DEC-52, WP-95).
 *
 * The host owns the HTTP server, CORS and socket.io instance; the relay owns
 * session state and behavior:
 *
 *   const relay = createRelay({ verifyOwnerToken, mirror });   // cloud
 *   const relay = createRelay();                               // LAN: no Firebase
 *   app.use('/api/sessions', relay.router);
 *   relay.attach(io);
 *   await relay.rehydrate();   // bound it yourself if the mirror can hang
 */
import type { Server as SocketServer } from 'socket.io';
import { EVENTS, type SessionPatch } from '@laude/session';
import type { Router } from 'express';
import { type RelayAdapters } from './adapters';
import { Mirror } from './mirror';
import { sessionRoutes, type RelayEvents } from './routes';
import { wireSockets } from './socket';
import { SessionStore } from './state';

export type { MirrorStoreAdapter, RelayAdapters } from './adapters';
export { SessionStore, viewerView } from './state';

export interface Relay {
  store: SessionStore;
  router: Router;
  /** Wire the socket fast path. Must be called before traffic; REST-only
   * hosts may skip it (broadcasts then no-op). */
  attach(io: SocketServer): void;
  /** Reload active sessions from the mirror (0 without one). */
  rehydrate(): Promise<number>;
}

export function createRelay(adapters: RelayAdapters = {}): Relay {
  const store = new SessionStore();
  const mirror = new Mirror(adapters.mirror);
  let io: SocketServer | null = null;

  const events: RelayEvents = {
    broadcast: (sessionId, patch: SessionPatch, updatedBy, updatedAt) => {
      io?.to(`session:${sessionId}`).emit(EVENTS.stateSync, {
        patch,
        updated_by: updatedBy,
        updated_at: updatedAt,
      });
    },
    broadcastEnd: (sessionId) => {
      io?.to(`session:${sessionId}`).emit(EVENTS.end);
    },
    mirror: (sessionId) => {
      const session = store.byId(sessionId);
      if (session) mirror.write(session);
    },
  };

  return {
    store,
    router: sessionRoutes(store, events, adapters),
    attach(server: SocketServer) {
      io = server;
      wireSockets(server, store, adapters, (session) => mirror.write(session));
    },
    rehydrate: () => mirror.rehydrate(store),
  };
}
