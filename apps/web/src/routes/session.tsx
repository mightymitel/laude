import { createFileRoute, Link } from '@tanstack/react-router'
import {
    useState,
    useCallback,
    useEffect,
    useRef,
    useMemo,
    Suspense,
} from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useSongs, useSong } from '@/hooks/useSongs'
import {
    useCommunitySongs,
    useFavorites,
} from '@/hooks/useCommunitySongs'
import { useLiveSession } from '@/hooks/useLiveSession'
import { PlaylistPanel, type SessionPlaylistItem } from '@/components/PlaylistPanel'
import { formatChord, extractChordsFromLine } from '@laudasist/shared'
import type { Key, ChordStyle, Song } from '@laudasist/shared'
import styles from './session.module.css'
import { usePlaylist } from '@/hooks/usePlaylists'
import { api } from '@/lib/api'
import { SongLine } from '@/components/songs/SongLine'
import { Modal } from '@/components/Modal/Modal'
import { Tuner } from '@/components/Tuner/Tuner'

const POSSIBLE_KEYS: Key[] = [
    'C',
    'G',
    'D',
    'A',
    'E',
    'B',
    'Gb',
    'Db',
    'Ab',
    'Eb',
    'Bb',
    'F',
]

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
    // Guest mode and playlist detection
    const { guest: isGuest, playlistId } = Route.useSearch()

    // Search state
    const [searchQuery, setSearchQuery] = useState('')
    const { data: searchResults } = useSongs({ search: searchQuery || undefined })
    const { data: allSongsData } = useSongs({}) // Fetch all songs

    // Load playlist if provided
    const { data: initialPlaylist } = usePlaylist(playlistId || '')

    // Community songs for guest mode
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: communityResults } = useCommunitySongs({
        search: searchQuery || undefined,
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isFavorite, addFavorite, removeFavorite } = useFavorites()

    // Local state for NON-LIVE practice mode only
    const [localSongId, setLocalSongId] = useState<string | null>(null)
    const [localPartIndex, setLocalPartIndex] = useState(0)
    const [localDisplayKey, setLocalDisplayKey] = useState<Key>('C')

    // Display preferences (always local)
    const [chordStyle, setChordStyle] = useState<ChordStyle>('letters')
    const [showChords, setShowChords] = useState(true)
    const [chordDisplay, setChordDisplay] = useState<
        'above' | 'inline' | 'compact'
    >('above')
    const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>([])
    const [useOriginalKey, setUseOriginalKey] = useState(true)

    // Local playlist for non-live mode
    const [localPlaylist, setLocalPlaylist] = useState<SessionPlaylistItem[]>([])
    const [playlistLoaded, setPlaylistLoaded] = useState(false)

    // Auto-load playlist from URL param
    useEffect(() => {
        if (initialPlaylist && !playlistLoaded) {
            const items = initialPlaylist.items.map((item) => ({
                id: `${Date.now()}-${item.songId}`,
                songId: item.songId,
                key: item.key,
                arrangement: item.arrangement,
            }))
            setLocalPlaylist(items)
            setPlaylistLoaded(true)
        }
    }, [initialPlaylist, playlistLoaded])

    // Live broadcasting
    const {
        isLive,
        isLoading,
        startLive,
        endLive,
        session,
        updateSession,
        setPlaylist,
        getShareUrl,
        getPresenterUrl,
    } = useLiveSession()

    // QR Code modal state
    const [showQR, setShowQR] = useState(false)
    const [selectedViewport, setSelectedViewport] = useState<'audience' | 'instrument' | 'stage'>('audience')
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    // === DERIVED STATE: Use session data when live, local state otherwise ===
    const currentSongId = isLive && session ? session.currentSongId : localSongId
    const currentPartIndex = isLive && session ? session.currentPartIndex : localPartIndex
    const displayKey = isLive && session ? session.displayKey : localDisplayKey
    const sessionPlaylist = isLive && session ? session.sessionPlaylist : localPlaylist

    // Get full song data
    const { data: currentSong } = useSong(currentSongId || '')

    // Refs for scrolling
    const partRefs = useRef<(HTMLDivElement | null)[]>([])

    // === UNIFIED STATE UPDATE HELPERS ===
    // Routes updates to local state OR mutation based on live status

    const setCurrentSongId = useCallback((songId: string | null) => {
        if (isLive) {
            updateSession({ currentSongId: songId })
        } else {
            setLocalSongId(songId)
        }
    }, [isLive, updateSession])

    const setCurrentPartIndex = useCallback((partIndex: number) => {
        if (isLive) {
            updateSession({ currentPartIndex: partIndex })
        } else {
            setLocalPartIndex(partIndex)
        }
    }, [isLive, updateSession])

    const setDisplayKey = useCallback((key: Key) => {
        if (isLive) {
            updateSession({ displayKey: key })
        } else {
            setLocalDisplayKey(key)
        }
    }, [isLive, updateSession])

    const setSessionPlaylist = useCallback((updater: SessionPlaylistItem[] | ((prev: SessionPlaylistItem[]) => SessionPlaylistItem[])) => {
        if (isLive) {
            // For mutations, always pass the new value
            const newPlaylist = typeof updater === 'function' ? updater(sessionPlaylist) : updater
            setPlaylist(newPlaylist)
        } else {
            setLocalPlaylist(updater)
        }
    }, [isLive, sessionPlaylist, setPlaylist])

    // Auto-scroll to active part
    useEffect(() => {
        if (currentPartIndex >= 0 && partRefs.current[currentPartIndex]) {
            partRefs.current[currentPartIndex]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            })
        }
    }, [currentPartIndex])

    // Sync local playlist to server when going live
    useEffect(() => {
        if (isLive && session && localPlaylist.length > 0) {
            // Push local playlist to server when first going live
            setPlaylist(localPlaylist)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLive])

    const goLive = useCallback(
        (song: Song) => {
            // If live and song not in playlist, add it as temporary
            if (isLive) {
                const isInPlaylist = sessionPlaylist.some((item) => item.songId === song.id)
                if (!isInPlaylist) {
                    const tempItem = {
                        id: `temp-${Date.now()}-${song.id}`,
                        songId: song.id,
                        key: song.originalKey,
                        song: {
                            id: song.id,
                            title: song.title,
                            author: song.author,
                            originalKey: song.originalKey,
                            parts: song.parts,
                        },
                        temporary: true,
                    }
                    setSessionPlaylist((prev) => [...prev, tempItem])
                }
                // Update session with embedded song data
                updateSession({
                    currentSongId: song.id,
                    currentSong: {
                        id: song.id,
                        title: song.title,
                        author: song.author,
                        originalKey: song.originalKey,
                        parts: song.parts,
                    },
                    currentPartIndex: 0,
                    displayKey: useOriginalKey ? song.originalKey : displayKey,
                })
            } else {
                setCurrentSongId(song.id)
                setCurrentPartIndex(0)
                if (useOriginalKey) {
                    setDisplayKey(song.originalKey)
                }
            }
            setSearchQuery('')
            // Track recently played
            setRecentlyPlayed((prev) => {
                const filtered = prev.filter((id) => id !== song.id)
                return [song.id, ...filtered].slice(0, 20)
            })
        },
        [isLive, sessionPlaylist, useOriginalKey, displayKey, setSessionPlaylist, updateSession, setCurrentSongId, setCurrentPartIndex, setDisplayKey],
    )

    // Smart ordering for library view when search is empty
    const orderedSongs = useMemo(() => {
        if (searchQuery || !allSongsData?.data) return null

        const songs = [...allSongsData.data]
        const relatedIds = new Set(currentSong?.relatedSongs || [])
        const recentSet = new Set(recentlyPlayed)

        // Sort: Favorites first (TODO: need user favorites), then related, then recent, then alpha
        return songs.sort((a, b) => {
            // Related songs to current
            const aRelated = relatedIds.has(a.id) ? 1 : 0
            const bRelated = relatedIds.has(b.id) ? 1 : 0
            if (aRelated !== bRelated) return bRelated - aRelated

            // Recently played
            const aRecent = recentSet.has(a.id) ? 1 : 0
            const bRecent = recentSet.has(b.id) ? 1 : 0
            if (aRecent !== bRecent) return bRecent - aRecent

            // Alphabetical
            return a.title.localeCompare(b.title)
        })
    }, [searchQuery, allSongsData, currentSong, recentlyPlayed])

    const displaySongs = searchQuery ? searchResults?.data : orderedSongs

    // Tuner state
    const [showTuner, setShowTuner] = useState(false);

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
                    <button
                        onClick={() => setShowTuner(true)}
                        className={styles.shareBtn} // reusing shareBtn style for now, or add new style
                        title="Open Guitar Tuner"
                    >
                        🎸 Tuner
                    </button>
                    {!isGuest &&
                        (isLive ? (
                            <>
                                <span className={styles.liveIndicator}>🔴 LIVE</span>
                                <button
                                    onClick={() => setShowQR(true)}
                                    className={styles.shareBtn}
                                >
                                    📤 Share
                                </button>
                                <button onClick={endLive} className={styles.endLiveBtn}>
                                    End Live
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={startLive}
                                disabled={isLoading}
                                className={styles.goLiveBtn}
                            >
                                {isLoading ? 'Starting...' : '🔴 Go Live'}
                            </button>
                        ))}
                    {isGuest && <span className={styles.guestIndicator}>👤 Guest Mode</span>}
                </div>
            </header>

            <div className={styles.layout}>
                {/* Left Panel: Search */}
                <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''}`}>
                    <button
                        className={styles.sidebarToggle}
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {sidebarCollapsed ? '→' : '←'}
                    </button>
                    {!sidebarCollapsed && (
                        <>
                            <div className={styles.searchBox}>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="🔍 Search songs..."
                                    className={styles.searchInput}
                                    autoFocus
                                />
                            </div>

                            <div className={styles.resultsList}>
                                {displaySongs?.map((song) => (
                                    <div
                                        key={song.id}
                                        className={`${styles.resultItem} ${song.id === currentSongId ? styles.resultItemActive : ''}`}
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/json', JSON.stringify({
                                                songId: song.id,
                                                key: song.originalKey,
                                                // Include song data for presenter access
                                                song: {
                                                    id: song.id,
                                                    title: song.title,
                                                    author: song.author,
                                                    originalKey: song.originalKey,
                                                    parts: song.parts,
                                                },
                                            }));
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }}
                                    >
                                        <button
                                            className={styles.resultContent}
                                            onClick={() => goLive(song)}
                                        >
                                            <span className={styles.resultTitle}>{song.title}</span>
                                            <span className={styles.resultKey}>{song.originalKey}</span>
                                        </button>
                                        <div className={styles.resultMenu}>
                                            <button
                                                className={styles.menuBtn}
                                                onClick={(e) => e.stopPropagation()}
                                                title="Song options"
                                            >
                                                ⋮
                                            </button>
                                            <div className={styles.menuDropdown}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSessionPlaylist((prev) => [
                                                            ...prev,
                                                            {
                                                                id: `${Date.now()}-${song.id}`,
                                                                songId: song.id,
                                                                key: song.originalKey,
                                                                // Embed song data for presenter access
                                                                song: {
                                                                    id: song.id,
                                                                    title: song.title,
                                                                    author: song.author,
                                                                    originalKey: song.originalKey,
                                                                    parts: song.parts,
                                                                },
                                                            },
                                                        ]);
                                                    }}
                                                >
                                                    ➕ Add to Playlist
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // TODO: Implement quick edit
                                                        alert('Quick edit coming soon!');
                                                    }}
                                                >
                                                    ✏️ Quick Edit
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {searchQuery && displaySongs?.length === 0 && (
                                    <div className={styles.noResults}>No songs found</div>
                                )}
                                {!displaySongs?.length && !searchQuery && (
                                    <div className={styles.hint}>No songs in library</div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Session Playlist */}
                    {!sidebarCollapsed && (
                        <PlaylistPanel
                            sessionPlaylist={sessionPlaylist}
                            currentSongId={currentSongId}
                            onAddSong={(item) => setSessionPlaylist((prev) => [...prev, item])}
                            onRemoveSong={(itemId) => setSessionPlaylist((prev) => prev.filter((i) => i.id !== itemId))}
                            onUpdateItem={(itemId, updates) => setSessionPlaylist((prev) =>
                                prev.map((i) => i.id === itemId ? { ...i, ...updates } : i)
                            )}
                            onSelectSong={(songId, key) => {
                                setCurrentSongId(songId)
                                if (key) setDisplayKey(key)
                                setCurrentPartIndex(0)
                            }}
                        />
                    )}
                </aside>

                {/* Right Panel: Live View */}
                <main className={styles.mainContent}>
                    {currentSong ? (
                        <>
                            <div className={styles.songHeader} data-testid="song-header">
                                <h2>{currentSong.title}</h2>
                                <div className={styles.controls}>
                                    <select
                                        value={displayKey}
                                        onChange={(e) => setDisplayKey(e.target.value as Key)}
                                        className={styles.select}
                                    >
                                        {POSSIBLE_KEYS.map((k) => (
                                            <option key={k} value={k}>
                                                {k}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={chordStyle}
                                        onChange={(e) =>
                                            setChordStyle(e.target.value as ChordStyle)
                                        }
                                        className={styles.select}
                                    >
                                        <option value="letters">Letters (Am)</option>
                                        <option value="caseSensitive">Case (a)</option>
                                        <option value="nashville">Nashville</option>
                                        <option value="roman">Roman</option>
                                    </select>
                                    <select
                                        value={chordDisplay}
                                        onChange={(e) =>
                                            setChordDisplay(
                                                e.target.value as 'above' | 'inline' | 'compact',
                                            )
                                        }
                                        className={styles.select}
                                    >
                                        <option value="above">Chords Above</option>
                                        <option value="inline">Inline</option>
                                        <option value="compact">Compact (End)</option>
                                    </select>
                                    <label className={styles.toggle}>
                                        <input
                                            type="checkbox"
                                            checked={showChords}
                                            onChange={(e) => setShowChords(e.target.checked)}
                                        />
                                        Show Chords
                                    </label>
                                    <label className={styles.toggle}>
                                        <input
                                            type="checkbox"
                                            checked={useOriginalKey}
                                            onChange={(e) => setUseOriginalKey(e.target.checked)}
                                        />
                                        Use Song Key
                                    </label>
                                </div>
                            </div>

                            <div className={styles.partsContainer}>
                                {currentSong.parts.map((part, index) => (
                                    <div
                                        key={index}
                                        ref={(el) => {
                                            partRefs.current[index] = el
                                        }}
                                        className={`${styles.part} ${index === currentPartIndex ? styles.activePart : ''}`}
                                        onClick={() => setCurrentPartIndex(index)}
                                    >
                                        <div className={styles.partLabel}>
                                            {part.type} {part.index > 0 ? part.index : ''}
                                        </div>
                                        <div className={styles.partContent}>
                                            {part.lines.map((line, lid) => (
                                                <SongLine
                                                    key={lid}
                                                    text={line.text}
                                                    displayKey={displayKey}
                                                    chordStyle={chordStyle}
                                                    showChords={showChords}
                                                    chordPosition={chordDisplay}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            <h2>Ready to Worship</h2>
                            <p>Select a song from the left to begin.</p>
                        </div>
                    )}
                </main>
            </div>

            {/* Share Modal */}
            {showQR && (
                <div className={styles.qrOverlay} onClick={() => setShowQR(false)}>
                    <div className={styles.qrModal} onClick={(e) => e.stopPropagation()}>
                        <h2>Share Session</h2>

                        <div className={styles.viewportSelector}>
                            <button
                                onClick={() => setSelectedViewport('audience')}
                                className={`${styles.viewportBtn} ${selectedViewport === 'audience' ? styles.viewportBtnActive : ''}`}
                            >
                                🎤 Audience
                            </button>
                            <button
                                onClick={() => setSelectedViewport('instrument')}
                                className={`${styles.viewportBtn} ${selectedViewport === 'instrument' ? styles.viewportBtnActive : ''}`}
                            >
                                🎹 Instrument
                            </button>
                            <button
                                onClick={() => setSelectedViewport('stage')}
                                className={`${styles.viewportBtn} ${selectedViewport === 'stage' ? styles.viewportBtnActive : ''}`}
                            >
                                🎸 Stage
                            </button>
                        </div>

                        <QRCodeSVG
                            value={`${getShareUrl()}?type=${selectedViewport}`}
                            size={200}
                            level="H"
                            includeMargin
                            bgColor="#ffffff"
                            fgColor="#000000"
                        />

                        <p className={styles.qrUrl}>{`${getShareUrl()}?type=${selectedViewport}`}</p>

                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(`${getShareUrl()}?type=${selectedViewport}`)
                            }}
                            className={styles.qrCopyBtn}
                        >
                            📋 Copy Viewer Link
                        </button>

                        <div className={styles.presenterSection}>
                            <span className={styles.presenterLabel}>🎙️ Presenter Link</span>
                            <p className={styles.presenterUrl}>{getPresenterUrl()}</p>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(getPresenterUrl())
                                }}
                                className={styles.qrCopyBtn}
                            >
                                📋 Copy Presenter Link
                            </button>
                        </div>

                        <button
                            onClick={() => setShowQR(false)}
                            className={styles.qrCloseBtn}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Tuner Modal */}
            <Modal isOpen={showTuner} onClose={() => setShowTuner(false)} title="Guitar Tuner">
                <Tuner mode="mini" />
            </Modal>
        </div>
    )
}

// End of file
