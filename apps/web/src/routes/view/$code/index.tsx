import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useSessionConnection } from '@/hooks/useSessionConnection'
import { extractChordsFromLine, formatChord } from '@laudasist/shared'
import type { Key, ChordStyle } from '@laudasist/shared'
import { asChordStyle, asKey } from '@/lib/keys'
import styles from './view.module.css'

type ViewportType = 'audience' | 'stage' | 'instrument' | 'subtitles'

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

    // One viewer connection: snapshot on join, pushed deltas afterwards — no
    // polling loop, no manual socket management.
    const { state: session, error } = useSessionConnection(code)

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

    if (error) {
        return <div className={styles.container}>Session not found or connection failed</div>
    }

    if (!session) {
        return <div className={styles.container}>Connecting...</div>
    }

    if (session.status === 'ended') {
        return (
            <div className={styles.container}>
                <div className={styles.ended}>
                    <h2>Session Ended</h2>
                    <p>The worship session has finished.</p>
                </div>
            </div>
        )
    }

    // Viewers render the by-value embedded song; a by-ref-only session (id
    // without payload) shows the waiting state until the presenter pushes one.
    const song = session.currentSong
    if (!session.current.song_id || !song) {
        return (
            <div className={styles.container}>
                <div className={styles.waiting}>
                    <h2>Waiting for presenter...</h2>
                    <p>Live session is active.</p>
                </div>
            </div>
        )
    }

    const partIndex = session.current.section_index
    const displayKey = asKey(session.current.key ?? song.originalKey)
    const currentPart = song.parts[partIndex]
    const nextPart = song.parts[partIndex + 1]

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
                    {song.author} • Key: {displayKey}
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
                        onChange={(e) => setChordStyle(asChordStyle(e.target.value))}
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
                                        displayKey={displayKey}
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
