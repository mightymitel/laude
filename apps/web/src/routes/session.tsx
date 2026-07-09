import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useRef, Suspense } from 'react'
import type { ChordStyle } from '@laudasist/shared'
import { useSessionSongState } from '@/hooks/useSessionSongState'
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
    const { guest: isGuest, playlistId } = Route.useSearch()

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
        useOriginalKey,
        setUseOriginalKey,
        setCurrentSongId,
        setCurrentPartIndex,
        setDisplayKey,
        setSessionPlaylist,
        pickSong,
        embed,
    } = useSessionSongState(playlistId)

    const { session, state, isLive, isLoading, error, goLive, stopLive, getShareUrl, getPresenterUrl } = live

    // Display preferences (always local)
    const [chordStyle, setChordStyle] = useState<ChordStyle>('letters')
    const [showChords, setShowChords] = useState(true)
    const [chordDisplay, setChordDisplay] = useState<ChordDisplay>('above')

    const [showQR, setShowQR] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
                            <button onClick={() => void goLive()} disabled={isLoading} className={styles.goLiveBtn}>
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
                        setCurrentSongId(songId)
                        if (key) setDisplayKey(asKey(key))
                        setCurrentPartIndex(0)
                    }}
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
                            useOriginalKey={useOriginalKey}
                            onSelectPart={setCurrentPartIndex}
                            onDisplayKey={setDisplayKey}
                            onChordStyle={setChordStyle}
                            onChordDisplay={setChordDisplay}
                            onShowChords={setShowChords}
                            onUseOriginalKey={setUseOriginalKey}
                            partRef={(index, el) => {
                                partRefs.current[index] = el
                            }}
                        />
                    ) : (
                        <div className={styles.emptyState}>
                            <h2>Ready to Worship</h2>
                            <p>Select a song from the left to begin.</p>
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
