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
import { formatChord, extractChordsFromLine } from '@laudasist/shared'
import type { Key, ChordStyle, Song } from '@laudasist/shared'
import styles from './session.module.css'

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
    // Guest mode detection
    const { guest: isGuest } = Route.useSearch()

    // Search state
    const [searchQuery, setSearchQuery] = useState('')
    const { data: searchResults } = useSongs({ search: searchQuery || undefined })
    const { data: allSongsData } = useSongs({}) // Fetch all songs

    // Community songs for guest mode
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: communityResults } = useCommunitySongs({
        search: searchQuery || undefined,
    })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isFavorite, addFavorite, removeFavorite } = useFavorites()

    // Live state (Local only)
    const [currentSongId, setCurrentSongId] = useState<string | null>(null)
    const [currentPartIndex, setCurrentPartIndex] = useState(0)
    const [displayKey, setDisplayKey] = useState<Key>('C')
    const [chordStyle, setChordStyle] = useState<ChordStyle>('letters')
    const [showChords, setShowChords] = useState(true)
    const [chordDisplay, setChordDisplay] = useState<
        'above' | 'inline' | 'compact'
    >('above')
    const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>([])
    const [useOriginalKey, setUseOriginalKey] = useState(true) // Key preference toggle

    // Live broadcasting
    const {
        isLive,
        isLoading,
        startLive,
        endLive,
        broadcastUpdate,
        getShareUrl,
    } = useLiveSession()

    // QR Code modal state
    const [showQR, setShowQR] = useState(false)
    const [selectedViewport, setSelectedViewport] = useState<'audience' | 'instrument' | 'stage'>('audience')

    // Get full song data
    const { data: currentSong } = useSong(currentSongId || '')

    // Refs for scrolling
    const partRefs = useRef<(HTMLDivElement | null)[]>([])

    // Update display key when song changes
    useEffect(() => {
        if (currentSong?.originalKey) {
            setDisplayKey(currentSong.originalKey)
        }
    }, [currentSong])

    // Auto-scroll to active part
    useEffect(() => {
        if (currentPartIndex >= 0 && partRefs.current[currentPartIndex]) {
            partRefs.current[currentPartIndex]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            })
        }
    }, [currentPartIndex])

    // Broadcast updates when live
    useEffect(() => {
        if (isLive) {
            broadcastUpdate({
                songId: currentSongId,
                partIndex: currentPartIndex,
                key: displayKey,
                // Include full song data for guest viewers
                song: currentSong ? {
                    id: currentSong.id,
                    title: currentSong.title,
                    author: currentSong.author,
                    originalKey: currentSong.originalKey,
                    parts: currentSong.parts,
                } : null,
            })
        }
    }, [isLive, currentSongId, currentPartIndex, displayKey, currentSong, broadcastUpdate])

    const goLive = useCallback(
        (song: Song) => {
            setCurrentSongId(song.id)
            setCurrentPartIndex(0)
            // Respect key preference
            if (useOriginalKey) {
                setDisplayKey(song.originalKey)
            }
            // If useOriginalKey is false, keep current displayKey
            setSearchQuery('')
            // Track recently played
            setRecentlyPlayed((prev) => {
                const filtered = prev.filter((id) => id !== song.id)
                return [song.id, ...filtered].slice(0, 20)
            })
        },
        [useOriginalKey],
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
                <aside className={styles.sidebar}>
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
                            <button
                                key={song.id}
                                onClick={() => goLive(song)}
                                className={`${styles.resultItem} ${song.id === currentSongId ? styles.resultItemActive : ''}`}
                            >
                                <span className={styles.resultTitle}>{song.title}</span>
                                <span className={styles.resultKey}>{song.originalKey}</span>
                            </button>
                        ))}
                        {searchQuery && displaySongs?.length === 0 && (
                            <div className={styles.noResults}>No songs found</div>
                        )}
                        {!displaySongs?.length && !searchQuery && (
                            <div className={styles.hint}>No songs in library</div>
                        )}
                    </div>
                </aside>

                {/* Right Panel: Live View */}
                <main className={styles.mainContent}>
                    {currentSong ? (
                        <>
                            <div className={styles.songHeader}>
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
                                                <LiveLine
                                                    key={lid}
                                                    text={line.text}
                                                    displayKey={displayKey}
                                                    originalKey={currentSong.originalKey}
                                                    chordStyle={chordStyle}
                                                    showChords={showChords}
                                                    chordDisplay={chordDisplay}
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
                            📋 Copy Link
                        </button>

                        <button
                            onClick={() => setShowQR(false)}
                            className={styles.qrCloseBtn}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

function LiveLine({
    text,
    displayKey,
    chordStyle,
    showChords,
    chordDisplay,
}: {
    text: string
    displayKey: Key
    originalKey: Key
    chordStyle: ChordStyle
    showChords: boolean
    chordDisplay: 'above' | 'inline' | 'compact'
}) {
    const { text: cleanText, chords } = extractChordsFromLine(text)

    if (!showChords || chords.length === 0) {
        return <div className={styles.line}>{cleanText}</div>
    }

    // Format all chords
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedChords = chords.map((c: any) =>
        formatChord(c.chord, displayKey, chordStyle),
    )

    // COMPACT MODE: chords before lyrics, with lowdash if first chord is late
    if (chordDisplay === 'compact') {
        const firstChordIndex = chords[0]?.index ?? 0
        const needsLowdash = firstChordIndex > 10
        const chordPrefix = needsLowdash ? '_ ' : ''

        return (
            <div className={styles.lineCompact}>
                <span className={styles.chordsStart}>
                    {chordPrefix}
                    {formattedChords.join(' ')}
                </span>
                <span>{cleanText}</span>
            </div>
        )
    }

    // INLINE MODE: chords in square brackets within text
    if (chordDisplay === 'inline') {
        const segments: React.ReactNode[] = []
        let lastIndex = 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chords.forEach((chordPos: any, i: number) => {
            if (chordPos.index > lastIndex) {
                segments.push(
                    <span key={`t${i}`}>
                        {cleanText.substring(lastIndex, chordPos.index)}
                    </span>,
                )
            }
            segments.push(
                <span key={`c${i}`} className={styles.chordInline}>
                    [{formattedChords[i]}]
                </span>,
            )
            lastIndex = chordPos.index
        })
        if (lastIndex < cleanText.length) {
            segments.push(<span key="end">{cleanText.substring(lastIndex)}</span>)
        }
        return <div className={styles.line}>{segments}</div>
    }

    // ABOVE MODE (default): chords positioned above text
    return (
        <div className={styles.lineAbove}>
            <div className={styles.chordRow}>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {chords.map((chordPos: any, i: number) => (
                    <span
                        key={i}
                        className={styles.chordAbove}
                        style={{ left: `${chordPos.index}ch` }}
                    >
                        {formattedChords[i]}
                    </span>
                ))}
            </div>
            <div className={styles.textRow}>{cleanText}</div>
        </div>
    )
}
