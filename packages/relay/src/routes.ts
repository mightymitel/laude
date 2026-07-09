/**
 * Session REST surface (kept + generalized from Laudasist's apps/api):
 *   POST   /api/sessions/live                owner (Bearer) — create or resume
 *   DELETE /api/sessions/live/:id            owner (Bearer) — end
 *   GET    /api/sessions/join/:accessCode    public — viewer snapshot
 *   GET    /api/sessions/presenter/:code     public — presenter snapshot (codes incl.)
 *   PUT    /api/sessions/update/:accessCode  public — REST update fallback
 * The socket path (see socket.ts) is the fast path; these exist for
 * link-following, late joins and non-socket clients.
 */
import { Router, type Request, type Response } from 'express';
import type { InitialSessionState, SessionPatch } from '@laude/session';
import { resolveOwnerId, type RelayAdapters } from './adapters';
import { SessionStore, viewerView } from './state';

export interface RelayEvents {
  /** Broadcast an applied patch (state:sync) to the session's room. */
  broadcast: (sessionId: string, patch: SessionPatch, updatedBy: string, updatedAt: string) => void;
  /** Broadcast session end to the session's room. */
  broadcastEnd: (sessionId: string) => void;
  /** Persist to the optional mirror. */
  mirror: (sessionId: string) => void;
}

function patchFromBody(body: unknown): SessionPatch {
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const patch: SessionPatch = {};
  if (typeof b.current === 'object' && b.current !== null) {
    patch.current = b.current as SessionPatch['current'];
  }
  if ('currentSong' in b) patch.currentSong = b.currentSong as SessionPatch['currentSong'];
  if (Array.isArray(b.sessionPlaylist)) {
    patch.sessionPlaylist = b.sessionPlaylist as SessionPatch['sessionPlaylist'];
  }
  if (typeof b.chordStyle === 'string') patch.chordStyle = b.chordStyle;
  if (typeof b.companion === 'object' && b.companion !== null) {
    patch.companion = b.companion as SessionPatch['companion'];
  }
  return patch;
}

async function requireOwner(
  adapters: RelayAdapters,
  req: Request,
  res: Response,
): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return null;
  }
  const ownerId = await resolveOwnerId(adapters, header.slice('Bearer '.length));
  if (!ownerId) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
  return ownerId;
}

export function sessionRoutes(
  store: SessionStore,
  events: RelayEvents,
  adapters: RelayAdapters,
): Router {
  const router = Router();

  router.post('/live', async (req, res) => {
    const ownerId = await requireOwner(adapters, req, res);
    if (!ownerId) return;
    const body =
      typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
    const initial =
      typeof body.initial === 'object' && body.initial !== null
        ? (body.initial as InitialSessionState)
        : undefined;
    // Repeatable go-live: a prior live session of this owner is ended and its
    // links die (Phase-1 revoke); fresh independent tokens are minted.
    const { session, endedSessionId } = store.createForOwner(ownerId, initial);
    if (endedSessionId) {
      events.broadcastEnd(endedSessionId);
      events.mirror(endedSessionId);
    }
    events.mirror(session.id);
    res.status(201).json(session);
  });

  router.delete('/live/:id', async (req, res) => {
    const ownerId = await requireOwner(adapters, req, res);
    if (!ownerId) return;
    const session = store.byId(req.params.id ?? '');
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (session.ownerId !== ownerId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    store.end(session.id);
    events.broadcastEnd(session.id);
    events.mirror(session.id);
    res.json({ success: true });
  });

  router.get('/join/:accessCode', (req, res) => {
    const session = store.activeByAccessCode(req.params.accessCode ?? '');
    if (!session) {
      res.status(404).json({ error: 'Session not found or ended' });
      return;
    }
    res.json(viewerView(session));
  });

  router.get('/presenter/:presenterCode', (req, res) => {
    const session = store.activeByPresenterCode(req.params.presenterCode ?? '');
    if (!session) {
      res.status(404).json({ error: 'Session not found or ended' });
      return;
    }
    res.json(session);
  });

  router.put('/update/:accessCode', (req, res) => {
    // Kept for non-socket writers; the access code is the (weak) credential,
    // exactly as in the original API. Fast path is socket state:set.
    const session = store.activeByAccessCode(req.params.accessCode ?? '');
    if (!session) {
      res.status(404).json({ error: 'Session not found or ended' });
      return;
    }
    const patch = patchFromBody(req.body);
    const updated = store.applyPatch(session.id, patch, 'rest');
    if (!updated) {
      res.status(409).json({ error: 'Session not active' });
      return;
    }
    events.broadcast(session.id, patch, updated.updated_by, updated.updated_at);
    events.mirror(session.id);
    res.json({ success: true });
  });

  return router;
}
