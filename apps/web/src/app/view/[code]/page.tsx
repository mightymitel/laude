'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { io } from 'socket.io-client';
import { useSong } from '@/hooks/useSongs';
import { api } from '@/lib/api';
import { extractChordsFromLine, formatChord } from '@laudasist/shared';
import type { Key } from '@laudasist/shared';
import styles from './view.module.css';

interface LiveSessionState {
    songId: string | null;
    partIndex: number;
    key: Key;
    status: 'active' | 'ended';
}

type ViewportType = 'audience' | 'stage' | 'instrument' | 'subtitles';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function GuestViewPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const searchParams = useSearchParams();
    const type = (searchParams.get('type') as ViewportType) || 'audience';

    const [sessionState, setSessionState] = useState<LiveSessionState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    // Listen for fullscreen changes
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    // Fetch initial state and connect socket
    useEffect(() => {
        let socket: any;

        const connect = async () => {
            try {
                const initial = await api.get<any>(`/api/sessions/join/${code}`);
                setSessionState({
                    songId: initial.currentSongId,
                    partIndex: initial.currentPartIndex,
                    key: initial.displayKey,
                    status: initial.status,
                });

                if (initial.status === 'ended') return;

                socket = io(API_URL);

                socket.on('connect', () => {
                    setIsConnected(true);
                    socket.emit('session:join', code);
                });

                socket.on('session:update', (data: any) => {
                    setSessionState(prev => prev ? { ...prev, ...data } : data);
                });

                socket.on('session:end', () => {
                    setSessionState(prev => prev ? { ...prev, status: 'ended' } : null);
                });

            } catch (err) {
                setError('Session not found or connection failed');
            }
        };

        connect();
        return () => { if (socket) socket.disconnect(); };
    }, [code]);

    const { data: song } = useSong(sessionState?.songId || '');

    if (error) {
        return <div className={styles.container}>{error}</div>;
    }

    if (!sessionState || !isConnected) {
        return <div className={styles.container}>Connecting...</div>;
    }

    if (sessionState.status === 'ended') {
        return (
            <div className={styles.container}>
                <div className={styles.ended}>
                    <h2>Session Ended</h2>
                    <p>The worship session has finished.</p>
                </div>
            </div>
        );
    }

    if (!sessionState.songId || !song) {
        return (
            <div className={styles.container}>
                <div className={styles.waiting}>
                    <h2>Waiting for presenter...</h2>
                    <p>Live session is active.</p>
                </div>
            </div>
        );
    }

    const currentPart = song.parts[sessionState.partIndex];
    const nextPart = song.parts[sessionState.partIndex + 1];

    const containerClass = [
        styles.container,
        type === 'audience' ? styles.audienceMode : '',
        type === 'stage' ? styles.stageMode : '',
        type === 'instrument' ? styles.instrumentMode : '',
        type === 'subtitles' ? styles.subtitlesMode : ''
    ].filter(Boolean).join(' ');

    return (
        <div className={containerClass}>
            <header className={styles.header}>
                <div className={styles.songTitle}>{song.title}</div>
                <div className={styles.songMeta}>
                    {song.author} • Key: {sessionState.key}
                </div>
            </header>

            <main className={styles.lyrics}>
                {currentPart && (
                    <>
                        <span className={styles.partLabel}>{currentPart.type}</span>
                        {currentPart.lines.map((line, i) => (
                            <div key={i}>
                                {(type === 'stage' || type === 'instrument') ? (
                                    <StageLine
                                        text={line.text}
                                        originalKey={song.originalKey}
                                        displayKey={sessionState.key}
                                    />
                                ) : (
                                    extractChordsFromLine(line.text).text
                                )}
                            </div>
                        ))}
                    </>
                )}

                {/* Instrument mode: show next part preview */}
                {type === 'instrument' && nextPart && (
                    <div className={styles.nextPart}>
                        <div className={styles.nextPartLabel}>Next: {nextPart.type}</div>
                        {nextPart.lines.slice(0, 2).map((line, i) => (
                            <div key={i}>{extractChordsFromLine(line.text).text}</div>
                        ))}
                    </div>
                )}
            </main>

            {/* Fullscreen button for audience mode */}
            {type === 'audience' && (
                <button className={styles.fullscreenBtn} onClick={toggleFullscreen}>
                    {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
                </button>
            )}
        </div>
    );
}

function StageLine({ text, originalKey, displayKey }: { text: string; originalKey: Key; displayKey: Key }) {
    const { chords, text: cleanText } = extractChordsFromLine(text);

    let chordLine = '';
    let lastIndex = 0;

    chords.forEach(chord => {
        const spaces = ' '.repeat(Math.max(0, chord.index - lastIndex));
        const chordStr = formatChord(chord.chord, displayKey, 'letters');
        chordLine += spaces + chordStr;
        lastIndex = chord.index + chordStr.length;
    });

    return (
        <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: '#0070f3', fontWeight: 'bold' }}>{chordLine}</div>
            <div>{cleanText}</div>
        </div>
    );
}
