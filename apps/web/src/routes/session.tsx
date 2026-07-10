import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, Suspense } from 'react'
import type { ChordStyle } from '@laudasist/shared'
import { useSessionSongState } from '@/hooks/useSessionSongState'
import { auth } from '@/lib/firebase'
import { asKey } from '@/lib/keys'
import styles from './session.module.css'
import { Modal } from '@/components/Modal/Modal'
import { Tuner } from '@/components/Tuner/Tuner'
import { WorshipPad } from '@/components/WorshipPad'
import { DirectivesBar } from '@/components/session/DirectivesBar'
import { SessionSidebar } from '@/components/session/SessionSidebar'
import { ShareModal } from '@/components/session/ShareModal'
import { SongPartsView, type ChordDisplay } from '@/components/session/SongPartsView'

export const Route = createFileRoute('/session')({
    component: SessionPage,
    validateSearch: (search: Record<string, unknown>) => {
        return {
            guest: search.guest === 'true' || search.guest === true,
            playlistId: typeof search.playlistId === 'string' ? search.playlistId : undefined,
            savedSessionId:
                typeof search.savedSessionId === 'string' ? search.savedSessionId : undefined,
        }
    },
})

function SessionPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <SessionPageContent />
        </Suspense>
    )
}

function SessionPageContent() {
    const { guest: isGuest, playlistId, savedSessionId } = Route.useSearch()
    const navigate = useNavigate()

    const {
        live,
        searchQuery,
        setSearchQuery,
        displaySongs,
        currentSong,
        currentSongId,
        currentPartIndex,
        displayKey,
        sessionPlaylist,
        keyPolicy,
        setKeyPolicy,
        setCurrentSongId,
        setCurrentPartIndex,
        setDisplayKey,
        setSessionPlaylist,
        pickSong,
        embed,
        djAudioSongIds,
        djLocalSongs,
        requestDjSong,
        savedSessionName,
    } = useSessionSongState(playlistId, savedSessionId)

    const { session, state, isLive, isLoading, error, goLive, stopLive, getShareUrl, getPresenterUrl } = live

    // Display preferences (always local)
    const [chordStyle, setChordStyle] = useState<ChordStyle>('letters')
    const [showChords, setShowChords] = useState(true)
    const [chordDisplay, setChordDisplay] = useState<ChordDisplay>('above')

    const [showQR, setShowQR] = useState(false)
    // Phones start with the drawer CLOSED — the set list must not bury the song.
    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
    )
    const [showTuner, setShowTuner] = useState(false)

    // Auto-scroll to active part
    const partRefs = useRef<(HTMLDivElement | null)[]>([])
    useEffect(() => {
        if (currentPartIndex >= 0 && partRefs.current[currentPartIndex]) {
            partRefs.current[currentPartIndex]?.scrollIntoView({ behavior: 'instant', block: 'center' })
        }
    }, [currentPartIndex])

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link to="/dashboard" className={styles.exitLink}>
                        ← Exit
                    </Link>
                    <h1>Worship Session</h1>
                </div>
                <div className={styles.headerRight}>
                    <WorshipPad displayKey={displayKey} />
                    <button onClick={() => setShowTuner(true)} className={styles.shareBtn} title="Open Guitar Tuner">
                        🎸 Tuner
                    </button>
                    {!isGuest &&
                        (isLive ? (
                            <>
                                <span className={styles.liveIndicator}>🔴 LIVE</span>
                                {state && state.presenters.length > 0 && (
                                    <span className={styles.guestIndicator} title="Connected members (role × type)">
                                        {state.presenters
                                            .map((m) => `${m.name} (${m.role}${m.kind === 'human' ? '' : ` · ${m.kind}`})`)
                                            .join(' · ')}
                                    </span>
                                )}
                                <button onClick={() => setShowQR(true)} className={styles.shareBtn}>
                                    📤 Share
                                </button>
                                <button onClick={() => void stopLive()} className={styles.endLiveBtn}>
                                    End Live
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => {
                                    // Going live needs an authed owner (DEC-36).
                                    // The conversion moment: sign in and come
                                    // back — the working session survives.
                                    if (!auth.currentUser) {
                                        if (window.confirm('Going live needs an account. Sign in now?')) {
                                            void navigate({ to: '/login', search: { redirect: 'session' } })
                                        }
                                        return
                                    }
                                    void goLive()
                                }}
                                disabled={isLoading}
                                className={styles.goLiveBtn}
                            >
                                {isLoading ? 'Starting...' : '🔴 Go Live'}
                            </button>
                        ))}
                    {error !== null && <span className={styles.guestIndicator}>⚠️ {error}</span>}
                    {isGuest && <span className={styles.guestIndicator}>👤 Guest Mode</span>}
                </div>
            </header>

            {isLive && state && <DirectivesBar session={session} state={state} />}

            <div className={styles.layout}>
                <SessionSidebar
                    collapsed={sidebarCollapsed}
                    onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    songs={displaySongs}
                    djAudioSongIds={djAudioSongIds}
                    djLocalSongs={djLocalSongs}
                    onRequestDjSong={requestDjSong}
                    currentSongId={currentSongId}
                    onPickSong={pickSong}
                    onAddToPlaylist={(song) =>
                        setSessionPlaylist((prev) => [
                            ...prev,
                            { id: `${Date.now()}-${song.id}`, songId: song.id, key: song.defaultKey, song: embed(song) },
                        ])
                    }
                    sessionPlaylist={sessionPlaylist}
                    onPlaylistAdd={(item) => setSessionPlaylist((prev) => [...prev, item])}
                    onPlaylistRemove={(itemId) => setSessionPlaylist((prev) => prev.filter((i) => i.id !== itemId))}
                    onPlaylistUpdate={(itemId, updates) =>
                        setSessionPlaylist((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i)))
                    }
                    onPlaylistSelect={(songId, key) => {
                        // One write: song + its authoritative effective_key
                        // (playlist-entry override respected — WP-144).
                        setCurrentSongId(songId, key)
                        setCurrentPartIndex(0)
                    }}
                    savedSessionId={savedSessionId}
                    savedSessionName={savedSessionName}
                />

                <main className={styles.mainContent}>
                    {currentSong ? (
                        <SongPartsView
                            song={currentSong}
                            currentPartIndex={currentPartIndex}
                            displayKey={displayKey}
                            chordStyle={chordStyle}
                            chordDisplay={chordDisplay}
                            showChords={showChords}
                            keyPolicy={keyPolicy}
                            onSelectPart={setCurrentPartIndex}
                            onDisplayKey={setDisplayKey}
                            onChordStyle={setChordStyle}
                            onChordDisplay={setChordDisplay}
                            onShowChords={setShowChords}
                            onKeyPolicy={setKeyPolicy}
                            partRef={(index, el) => {
                                partRefs.current[index] = el
                            }}
                        />
                    ) : (
                        <div className={styles.emptyState}>
                            <h2>Ready to Worship</h2>
                            <p>Open 🎵 Songs to search and pick a song.</p>
                        </div>
                    )}
                </main>
            </div>

            {showQR && <ShareModal shareUrl={getShareUrl()} presenterUrl={getPresenterUrl()} onClose={() => setShowQR(false)} />}

            <Modal isOpen={showTuner} onClose={() => setShowTuner(false)} title="Guitar Tuner">
                <Tuner mode="mini" />
            </Modal>
        </div>
    )
}
