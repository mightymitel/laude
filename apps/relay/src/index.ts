/**
 * Session relay entry point — a plain Node service (deliberately NOT part of
 * apps/api) so it can run in the cloud, on a laptop, or inside LaudStudio for
 * fully-offline LAN sessions. Express REST + socket.io on one HTTP server.
 */
import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server as SocketServer } from 'socket.io';
import { EVENTS, type SessionPatch } from '@laude/session';
import { initFirebase } from './firebase';
import { mirrorSession, rehydrate } from './mirror';
import { sessionRoutes, type RelayEvents } from './routes';
import { wireSockets } from './socket';
import { SessionStore } from './state';

const PORT = Number(process.env.RELAY_PORT ?? 3003);

async function main(): Promise<void> {
  initFirebase();

  const store = new SessionStore();
  // The mirror is optional — never let a slow/unreachable Firestore block
  // the relay from serving (it is the authoritative store either way).
  const restored = await Promise.race([
    rehydrate(store),
    new Promise<number>((resolve) => setTimeout(() => resolve(0), 5000)),
  ]);
  if (restored > 0) console.log(`relay: rehydrated ${restored} active session(s) from the mirror`);

  const app = express();
  app.use(cors()); // local/LAN service — open CORS, credentials ride the URL codes
  app.use(express.json({ limit: '1mb' })); // by-value songs are small text blobs

  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, { cors: { origin: true } });

  const events: RelayEvents = {
    broadcast: (sessionId: string, patch: SessionPatch, updatedBy: string, updatedAt: string) => {
      io.to(`session:${sessionId}`).emit(EVENTS.stateSync, {
        patch,
        updated_by: updatedBy,
        updated_at: updatedAt,
      });
    },
    broadcastEnd: (sessionId: string) => {
      io.to(`session:${sessionId}`).emit(EVENTS.end);
    },
    mirror: (sessionId: string) => {
      const session = store.byId(sessionId);
      if (session) mirrorSession(session);
    },
  };

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/sessions', sessionRoutes(store, events));

  wireSockets(io, store);

  httpServer.listen(PORT, () => {
    console.log(`session relay on http://localhost:${PORT} (REST /api/sessions + socket.io)`);
  });
}

main().catch((err) => {
  console.error('relay failed to start:', err);
  process.exit(1);
});
