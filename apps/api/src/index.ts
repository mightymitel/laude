import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRelay } from '@laude/relay';
import { Server as SocketServer } from 'socket.io';
import { initializeFirebase } from './config/firebase.js';
import { relayAdapters } from './relay/adapters.js';
import { previewForPath, renderIndexHtml, type PreviewDeps } from './preview/linkPreview.js';
import { getSongsCollection, type SongDocument } from './models/Song.js';
import { getUsersCollection } from './models/User.js';
import { authMiddleware } from './middleware/auth.js';
import usersRouter from './routes/users.js';
import songsRouter from './routes/songs.js';
import servicesRouter from './routes/services.js';
import importRouter from './routes/import.js';

// The session relay is a MODULE mounted here (DEC-52/WP-95): one Express +
// socket.io App Hosting backend, pinned to a single instance (RAM-
// authoritative session state cannot scale horizontally — DEC-53). The
// Firestore mirror + token verification are injected adapters, so a light
// LAN build constructs the same relay with none.

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        const allowed = [
            process.env.FRONTEND_URL || 'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:5174',
            'https://laudasist.ro'
        ];
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Check against static whitelist
        if (allowed.indexOf(origin) !== -1) return callback(null, true);

        // Allow localhost and private-LAN origins (dev boxes + phones on the
        // wifi hitting the dev stack — RFC1918 ranges only, never public).
        if (/^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }

        // Allow any Firebase hosting domain (*.web.app, *.firebaseapp.com, *.hosted.app)
        if (/^https:\/\/.*\.(web\.app|firebaseapp\.com|hosted\.app)$/.test(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/songs', authMiddleware, songsRouter);
app.use('/api/services', authMiddleware, servicesRouter);
app.use('/api/import', authMiddleware, importRouter);

// Community routes - public, no auth required
import communityRouter from './routes/community.js';
app.use('/api/community', communityRouter);

// Playlist routes - require auth
import playlistsRouter from './routes/playlists.js';
app.use('/api/playlists', authMiddleware, playlistsRouter);

// Persisted sessions, narrow (DEC-96/99) — owner-scoped, require auth.
import savedSessionsRouter from './routes/savedSessions.js';
app.use('/api/saved-sessions', authMiddleware, savedSessionsRouter);

// Lyrics search (WP-105): optional auth — anonymous sees public+official,
// authed additionally sees own private songs. Always-warm process by design.
import searchRouter from './routes/search.js';
import { optionalAuthMiddleware } from './middleware/auth.js';
app.use('/api/search', optionalAuthMiddleware, searchRouter);

// Start server
const PORT = process.env.PORT || 3001;

async function start() {
    try {
        // Initialize Firebase Admin
        initializeFirebase();

        // Session relay: REST under /api/sessions + the socket fast path.
        const relay = createRelay(relayAdapters());
        app.use('/api/sessions', relay.router);
        const io = new SocketServer(httpServer, { cors: { origin: true } });
        relay.attach(io);
        // Bounded: a slow mirror must never block the relay from serving.
        const restored = await Promise.race([
            relay.rehydrate(),
            new Promise<number>((resolve) => setTimeout(() => resolve(0), 5000)),
        ]);
        if (restored > 0) console.log(`relay: rehydrated ${restored} active session(s) from the mirror`);

        // Single-backend deploy (DEC-103): this process also serves the built
        // web app when a bundle exists (App Hosting builds it right before
        // starting us). Dev keeps using Vite on :5173 — no dist, no serving.
        const webDist = process.env.WEB_DIST ?? join(__dirname, '../../web/dist');
        if (existsSync(join(webDist, 'index.html'))) {
            // Never let the static layer serve index.html — the SPA fallback
            // below templates per-route OG tags into it (WP-160).
            app.use(express.static(webDist, { index: false }));
            const indexHtml = readFileSync(join(webDist, 'index.html'), 'utf8');
            const previewDeps: PreviewDeps = {
                sessionByAccessCode: (code) => relay.store.activeByAccessCode(code),
                sessionByPresenterCode: (code) => relay.store.activeByPresenterCode(code),
                ownerName: async (uid) => {
                    const doc = await getUsersCollection().doc(uid).get();
                    const name: unknown = doc.exists ? doc.data()?.displayName : null;
                    return typeof name === 'string' && name !== '' ? name : null;
                },
                publicSong: async (id) => {
                    const doc = await getSongsCollection().doc(id).get();
                    if (!doc.exists) return null;
                    const song = doc.data() as SongDocument;
                    if (song.visibility !== 'public' && song.libraryType !== 'official') return null;
                    return { title: song.title, author: song.author ?? null };
                },
            };
            // SPA fallback for client-routed paths; API + socket paths keep 404ing honestly.
            app.get('*', (req, res, next) => {
                if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next();
                const proto = req.get('x-forwarded-proto') ?? req.protocol;
                const baseUrl = `${proto}://${req.get('host') ?? 'laudasist.ro'}`;
                previewForPath(req.path, previewDeps)
                    .catch((err: unknown) => {
                        // A broken preview must never break the page itself.
                        console.warn('link preview failed', err);
                        return null;
                    })
                    .then((tags) => {
                        res.type('html').send(renderIndexHtml(indexHtml, tags, baseUrl, req.path));
                    });
            });
            console.log(`serving web bundle from ${webDist} (per-route link previews on)`);
        }

        httpServer.listen(PORT, () => {
            console.log(`🚀 API server running on http://localhost:${PORT} (REST + session relay)`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Only start if run directly
if (require.main === module) {
    start();
}

export { app, httpServer };
