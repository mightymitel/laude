import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { api } from '@/lib/api'
import { extractChordsFromLine, formatChord } from '@laudasist/shared'
import type { Key, ChordStyle } from '@laudasist/shared'
import styles from './view.module.css'

interface LiveSessionState {
    songId: string | null
    partIndex: number
    key: Key
    status: 'active' | 'ended'
}

type ViewportType = 'audience' | 'stage' | 'instrument' | 'subtitles'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const Route = createFileRoute('/view/$code/')({
    component: GuestViewPage,
    validateSearch: (search: Record<string, unknown>) => {
        return {
            type: (search.type as ViewportType) || 'audience',
        }
    },
})

function GuestViewPage() {
    const { code } = Route.useParams()
    const { type } = Route.useSearch()
    const navigate = useNavigate()

    const [sessionState, setSessionState] = useState<LiveSessionState | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [chordStyle, setChordStyle] = useState<ChordStyle>('letters')
    const [showToolbar, setShowToolbar] = useState(true)
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
            setIsFullscreen(true)
        } else {
            document.exitFullscreen()
            setIsFullscreen(false)
        }
    }, [])

    // Listen for fullscreen changes
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', handler)
        return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    // Auto-hide toolbar in fullscreen
    const handleUserActivity = useCallback(() => {
        setShowToolbar(true)
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
        }
        if (isFullscreen) {
            hideTimeoutRef.current = setTimeout(() => {
                setShowToolbar(false)
            }, 3000)
        }
    }, [isFullscreen])

    useEffect(() => {
        if (isFullscreen) {
            document.addEventListener('mousemove', handleUserActivity)
            document.addEventListener('touchstart', handleUserActivity)
            document.addEventListener('keydown', handleUserActivity)
            handleUserActivity() // Start the initial timer
        } else {
            setShowToolbar(true)
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }
        }
        return () => {
            document.removeEventListener('mousemove', handleUserActivity)
            document.removeEventListener('touchstart', handleUserActivity)
            document.removeEventListener('keydown', handleUserActivity)
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }
        }
    }, [isFullscreen, handleUserActivity])

    // Song state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [song, setSong] = useState<any>(null)

    // Fetch initial state, then poll for updates (WebSocket may not work on App Hosting)
    useEffect(() => {
        let mounted = true
        let pollInterval: ReturnType<typeof setInterval> | null = null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let socket: any = null

        const fetchSessionState = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.get<any>(`/api/sessions/join/${code}`)
                if (!mounted) return

                setSessionState({
                    songId: data.currentSongId,
                    partIndex: data.currentPartIndex,
                    key: data.displayKey,
                    status: data.status,
                })

                // Mark as connected after first successful fetch
                setIsConnected(true)

                // Fetch song data if session has a song
                if (data.currentSongId) {
                    try {
                        const songData = await api.get(`/api/sessions/song/${code}/${data.currentSongId}`)
                        if (mounted) setSong(songData)
                    } catch {
                        // Song fetch failed, will retry on next poll
                    }
                }

                return data.status
            } catch (err) {
                if (mounted) setError('Session not found or connection failed')
                return null
            }
        }

        const connect = async () => {
            const status = await fetchSessionState()
            if (!mounted || status === 'ended') return

            // Try WebSocket for real-time updates (optional enhancement)
            try {
                socket = io(API_URL)

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                socket.on('session:update', (data: any) => {
                    if (!mounted) return
                    setSessionState((prev) => (prev ? { ...prev, ...data } : data))
                    if (data.song) setSong(data.song)
                })

                // Direct state sync for fast part/key changes
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                socket.on('state:sync', (data: any) => {
                    if (!mounted) return
                    if (data.partIndex !== undefined) {
                        setSessionState((prev) => prev ? { ...prev, partIndex: data.partIndex } : prev)
                    }
                    if (data.key !== undefined) {
                        setSessionState((prev) => prev ? { ...prev, key: data.key } : prev)
                    }
                    if (data.songId !== undefined) {
                        setSessionState((prev) => prev ? { ...prev, songId: data.songId } : prev)
                        if (data.song) setSong(data.song)
                    }
                })

                socket.on('session:end', () => {
                    if (mounted) setSessionState((prev) => (prev ? { ...prev, status: 'ended' } : null))
                })

                socket.on('connect', () => {
                    socket.emit('session:join', code)
                })
            } catch {
                // WebSocket failed, rely on polling
            }

            // Poll every 2 seconds as fallback (or primary if WebSocket fails)
            pollInterval = setInterval(async () => {
                const newStatus = await fetchSessionState()
                if (newStatus === 'ended' && pollInterval) {
                    clearInterval(pollInterval)
                }
            }, 2000)
        }

        connect()

        return () => {
            mounted = false
            if (pollInterval) clearInterval(pollInterval)
            if (socket) socket.disconnect()
        }
    }, [code])

    if (error) {
        return <div className={styles.container}>{error}</div>
    }

    if (!sessionState || !isConnected) {
        return <div className={styles.container}>Connecting...</div>
    }

    if (sessionState.status === 'ended') {
        return (
            <div className={styles.container}>
                <div className={styles.ended}>
                    <h2>Session Ended</h2>
                    <p>The worship session has finished.</p>
                </div>
            </div>
        )
    }

    if (!sessionState.songId || !song) {
        return (
            <div className={styles.container}>
                <div className={styles.waiting}>
                    <h2>Waiting for presenter...</h2>
                    <p>Live session is active.</p>
                </div>
            </div>
        )
    }

    const currentPart = song.parts[sessionState.partIndex]
    const nextPart = song.parts[sessionState.partIndex + 1]

    const containerClass = [
        styles.container,
        type === 'audience' ? styles.audienceMode : '',
        type === 'stage' ? styles.stageMode : '',
        type === 'instrument' ? styles.instrumentMode : '',
        type === 'subtitles' ? styles.subtitlesMode : '',
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <div className={containerClass}>
            <header className={styles.header}>
                <div className={styles.songTitle} data-testid="song-title">{song.title}</div>
                <div className={styles.songMeta}>
                    {song.author} • Key: {sessionState.key}
                </div>
            </header>

            {/* Floating Toolbar - auto-hides in fullscreen */}
            <div className={`${styles.toolbar} ${showToolbar ? styles.toolbarVisible : styles.toolbarHidden}`}>
                <select
                    className={styles.select}
                    value={type}
                    onChange={(e) => navigate({ to: '.', search: { type: e.target.value as ViewportType } })}
                    data-testid="viewport-select"
                >
                    <option value="audience">🎤 Audience</option>
                    <option value="stage">🎸 Stage</option>
                    <option value="instrument">🎹 Instrument</option>
                    <option value="subtitles">📺 Subtitles</option>
                </select>
                {(type === 'stage' || type === 'instrument') && (
                    <select
                        className={styles.select}
                        value={chordStyle}
                        onChange={(e) => setChordStyle(e.target.value as ChordStyle)}
                        data-testid="chord-style-select"
                    >
                        <option value="letters">Letters (Am)</option>
                        <option value="caseSensitive">Case (a)</option>
                        <option value="nashville">Nashville</option>
                        <option value="roman">Roman</option>
                    </select>
                )}
                <button className={styles.fullscreenBtn} onClick={toggleFullscreen}>
                    {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
                </button>
            </div>

            <main className={styles.lyrics}>
                {currentPart && (
                    <>
                        <span className={styles.partLabel}>{currentPart.type}</span>
                        {currentPart.lines.map((line, i) => (
                            <div key={i}>
                                {type === 'stage' || type === 'instrument' ? (
                                    <StageLine
                                        text={line.text}
                                        displayKey={sessionState.key}
                                        chordStyle={chordStyle}
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
        </div>
    )
}

function StageLine({
    text,
    displayKey,
    chordStyle,
}: {
    text: string
    displayKey: Key
    chordStyle: ChordStyle
}) {
    const { chords, text: cleanText } = extractChordsFromLine(text)

    let chordLine = ''
    let lastIndex = 0

    chords.forEach((chord) => {
        const spaces = ' '.repeat(Math.max(0, chord.index - lastIndex))
        const chordStr = formatChord(chord.chord, displayKey, chordStyle)
        chordLine += spaces + chordStr
        lastIndex = chord.index + chordStr.length
    })

    return (
        <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: '#0070f3', fontWeight: 'bold' }}>{chordLine}</div>
            <div>{cleanText}</div>
        </div>
    )
}
