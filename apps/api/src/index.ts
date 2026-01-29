import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { initializeFirebase } from './config/firebase.js';
import { authMiddleware } from './middleware/auth.js';
import usersRouter from './routes/users.js';
import songsRouter from './routes/songs.js';
import servicesRouter from './routes/services.js';
import importRouter from './routes/import.js';

const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new SocketServer(httpServer, {
    cors: {
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

            // Allow any localhost/127.0.0.1
            if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }

            // Allow any Firebase hosting domain (*.web.app, *.firebaseapp.com, *.hosted.app)
            if (/^https:\/\/.*\.(web\.app|firebaseapp\.com|hosted\.app)$/.test(origin)) {
                return callback(null, true);
            }

            return callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Make io available to routes for server-side event emission
app.set('io', io);

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

        // Allow any localhost/127.0.0.1
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
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

// Session routes - join endpoint is public, others need auth
import sessionsRouter from './routes/sessions.js';
app.use('/api/sessions', sessionsRouter);

// Community routes - public, no auth required
import communityRouter from './routes/community.js';
app.use('/api/community', communityRouter);

// Playlist routes - require auth
import playlistsRouter from './routes/playlists.js';
app.use('/api/playlists', authMiddleware, playlistsRouter);

// Socket.io connection handling
io.on('connection', socket => {
    console.log('Client connected:', socket.id);

    // Legacy service events
    socket.on('join-service', (serviceId: string) => {
        socket.join(`service:${serviceId}`);
        console.log(`Socket ${socket.id} joined service:${serviceId}`);
    });

    socket.on('leave-service', (serviceId: string) => {
        socket.leave(`service:${serviceId}`);
        console.log(`Socket ${socket.id} left service:${serviceId}`);
    });

    // Live session events
    socket.on('session:join', (accessCode: string) => {
        const room = `session:${accessCode.toUpperCase()}`;
        socket.join(room);
        console.log(`Socket ${socket.id} joined ${room}`);
    });

    socket.on('session:leave', (accessCode: string) => {
        const room = `session:${accessCode.toUpperCase()}`;
        socket.leave(room);
        console.log(`Socket ${socket.id} left ${room}`);
    });

    // === Session Sync Events ===
    // All controllers (owner + presenters) can emit these events
    // Server broadcasts state:sync to ALL clients in room (including sender for confirmation)

    // Song change - when a controller selects a new song
    socket.on('song:change', (data: {
        accessCode: string;
        songId: string | null;
        song?: { id: string; title: string; author?: string; originalKey: string; parts: unknown[] } | null;
        partIndex: number;
        key: string
    }) => {
        const room = `session:${data.accessCode.toUpperCase()}`;
        // Broadcast to ALL in room including sender
        io.to(room).emit('state:sync', {
            songId: data.songId,
            song: data.song || null,
            partIndex: data.partIndex,
            key: data.key,
        });
        console.log(`[${room}] song:change -> state:sync (songId: ${data.songId})`);
    });

    // Part change - when a controller navigates parts
    socket.on('part:change', (data: { accessCode: string; partIndex: number }) => {
        const room = `session:${data.accessCode.toUpperCase()}`;
        io.to(room).emit('state:sync', { partIndex: data.partIndex });
        console.log(`[${room}] part:change -> state:sync (partIndex: ${data.partIndex})`);
    });

    // Key change - when a controller changes the display key
    socket.on('key:change', (data: { accessCode: string; key: string }) => {
        const room = `session:${data.accessCode.toUpperCase()}`;
        io.to(room).emit('state:sync', { key: data.key });
        console.log(`[${room}] key:change -> state:sync (key: ${data.key})`);
    });

    // === NEW: Simple state change notification ===
    // Clients emit this after updating state via API
    // All clients in room refetch their session state
    socket.on('state:changed', (data: { accessCode: string }) => {
        const room = `session:${data.accessCode.toUpperCase()}`;
        io.to(room).emit('state:changed');
        console.log(`[${room}] state:changed broadcast`);
    });

    // Playlist change - notify presenters to re-fetch playlist via API
    socket.on('playlist:change', (data: { accessCode: string }) => {
        const room = `session:${data.accessCode.toUpperCase()}`;
        io.to(room).emit('state:sync', { playlistUpdated: true });
        console.log(`[${room}] playlist:change -> state:sync (playlistUpdated)`);
    });

    // Legacy: Keep session:update for backward compatibility during transition
    socket.on('session:update', (data: { accessCode: string; songId: string | null; partIndex: number; key: string; song?: unknown }) => {
        const room = `session:${data.accessCode.toUpperCase()}`;
        io.to(room).emit('state:sync', {
            songId: data.songId,
            partIndex: data.partIndex,
            key: data.key,
            song: data.song || null,
        });
    });

    // Session end - notify all clients
    socket.on('session:end', (accessCode: string) => {
        const room = `session:${accessCode.toUpperCase()}`;
        io.to(room).emit('session:end');
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Start server
// Start server
const PORT = process.env.PORT || 3001;

async function start() {
    try {
        // Initialize Firebase Admin
        initializeFirebase();

        httpServer.listen(PORT, () => {
            console.log(`🚀 API server running on http://localhost:${PORT}`);
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

export { app, io, httpServer };
