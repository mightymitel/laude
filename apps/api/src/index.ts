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
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
    },
});

// Middleware
app.use(cors());
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

    // Presenter broadcasts update to all viewers
    socket.on('session:update', (data: { accessCode: string; songId: string | null; partIndex: number; key: string }) => {
        const room = `session:${data.accessCode.toUpperCase()}`;
        socket.to(room).emit('session:update', {
            songId: data.songId,
            partIndex: data.partIndex,
            key: data.key,
        });
    });

    // Presenter ends session
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
