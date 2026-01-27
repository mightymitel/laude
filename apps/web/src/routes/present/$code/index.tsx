import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSessionState } from '@/hooks/useSessionState'
import { useCommunitySongs } from '@/hooks/useCommunitySongs'
import { formatChord, extractChordsFromLine } from '@laudasist/shared'
import type { Key, SongPart } from '@laudasist/shared'
import styles from './present.module.css'

// Embedded song data type matching API response
interface EmbeddedSong {
  id: string
  title: string
  author?: string
  originalKey: Key
  parts: SongPart[]
}

interface SessionPlaylistItem {
  id: string
  songId: string
  key?: Key
  song?: EmbeddedSong
}

// Response from /api/sessions/presenter/:code
interface PresenterSessionInit {
  id: string
  accessCode: string
  presenterCode: string
  status: 'active' | 'ended'
  currentSongId: string | null
  currentSong?: EmbeddedSong
  currentPartIndex: number
  displayKey: Key
  sessionPlaylist: SessionPlaylistItem[]
}

export const Route = createFileRoute('/present/$code/')({
  component: PresenterPage,
})

function PlaylistItemRow({ item, isActive, onClick }: {
  item: SessionPlaylistItem
  isActive: boolean
  onClick: () => void
}) {
  const song = item.song

  return (
    <button
      className={`${styles.playlistItem} ${isActive ? styles.playlistItemActive : ''}`}
      onClick={onClick}
    >
      <span className={styles.songTitle}>{song?.title || 'Unknown Song'}</span>
      <span className={styles.songKey}>{item.key || song?.originalKey || '?'}</span>
    </button>
  )
}

function PresenterPage() {
  const { code } = Route.useParams()

  // 1. Initial fetch to validate presenter code and get accessCode
  const { data: initialSession, error: initError, isLoading: initLoading } = useQuery({
    queryKey: ['presenter-init', code],
    queryFn: () => api.get<PresenterSessionInit>(`/api/sessions/presenter/${code}`),
    retry: false
  })

  // 2. Real-time sync hook using accessCode
  // This handles socket invalidation and polling automatically
  const { data: sessionState, updateSession, emitPartChange } = useSessionState(initialSession?.accessCode || null)

  // Use the live state if available, otherwise initial state
  const session = sessionState || initialSession

  // Local state for UI (search)
  const [searchQuery, setSearchQuery] = useState('')
  const { data: searchResults } = useCommunitySongs({ search: searchQuery || undefined })

  // --- ACTIONS ---

  // Select song from playlist
  const selectSong = useCallback((item: SessionPlaylistItem) => {
    if (!item.song) return

    updateSession({
      currentSongId: item.song.id,
      currentSong: item.song,
      currentPartIndex: 0,
      displayKey: item.key || item.song.originalKey
    })
  }, [updateSession])

  // Navigate parts (fast direct socket)
  const goToPart = useCallback((index: number) => {
    emitPartChange(index)
  }, [emitPartChange])

  const nextPart = useCallback(() => {
    if (session?.currentSong && (session.currentPartIndex ?? 0) < session.currentSong.parts.length - 1) {
      goToPart((session?.currentPartIndex ?? 0) + 1)
    }
  }, [session, goToPart])

  const prevPart = useCallback(() => {
    if ((session?.currentPartIndex ?? 0) > 0) {
      goToPart((session?.currentPartIndex ?? 0) - 1)
    }
  }, [session, goToPart])

  // Select community song
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectCommunitySong = (song: any) => {
    const embedded: EmbeddedSong = {
      id: song.id,
      title: song.title,
      author: song.author,
      originalKey: song.originalKey,
      parts: song.parts,
    }

    setSearchQuery('')
    updateSession({
      currentSongId: embedded.id,
      currentSong: embedded,
      currentPartIndex: 0,
      displayKey: song.originalKey
    })
  }

  // Render chord helper
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderChord = (chord: any) => {
    return formatChord(chord, session?.displayKey || 'C', 'letters')
  }

  // --- RENDERING ---

  if (initLoading) {
    return <div className={styles.container}><div className={styles.loading}>Connecting to session...</div></div>
  }

  if (initError || !session) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Session Not Found</h2>
          <p>{(initError as Error)?.message || 'Invalid presenter code'}</p>
        </div>
      </div>
    )
  }

  const currentSong = session.currentSong
  const currentPartIndex = session.currentPartIndex ?? 0
  const displayKey = session.displayKey || 'C'

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Presenter View</h1>
        <div className={styles.sessionInfo}>
          <span>Viewer Code: <strong>{session.accessCode}</strong></span>
        </div>
      </header>

      <div className={styles.layout}>
        {/* Sidebar with Playlist and Search */}
        <aside className={styles.sidebar}>
          {/* Search Panel */}
          <div className={styles.searchPanel}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search community songs..."
              className={styles.searchInput}
            />
            {searchQuery && searchResults && searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map((song) => (
                  <button
                    key={song.id}
                    className={styles.searchResultItem}
                    onClick={() => selectCommunitySong(song)}
                  >
                    <span>{song.title}</span>
                    <span className={styles.songKey}>{song.originalKey}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Playlist Panel */}
          <div className={styles.sidebarHeader}>
            <h3>📋 Session Playlist</h3>
          </div>

          {(session.sessionPlaylist?.length ?? 0) > 0 ? (
            <div className={styles.playlistList}>
              {session.sessionPlaylist.map((item) => (
                <PlaylistItemRow
                  key={item.id}
                  item={item}
                  isActive={item.songId === currentSong?.id}
                  onClick={() => selectSong(item)}
                />
              ))}
            </div>
          ) : (
            <div className={styles.emptyPlaylist}>
              No songs in playlist. The session owner will add songs.
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className={styles.main}>
          {currentSong ? (
            <>
              <div className={styles.songHeader} data-testid="song-header">
                <h2>{currentSong.title}</h2>
                <div className={styles.controls}>
                  <span className={styles.keyBadge}>Key: {displayKey}</span>
                </div>
              </div>

              <div className={styles.partsNav}>
                <button onClick={prevPart} disabled={currentPartIndex === 0}>
                  ← Prev
                </button>
                <span>Part {currentPartIndex + 1} of {currentSong.parts.length}</span>
                <button onClick={nextPart} disabled={currentPartIndex >= currentSong.parts.length - 1}>
                  Next →
                </button>
              </div>

              <div className={styles.partsGrid}>
                {currentSong.parts.map((part, index) => (
                  <button
                    key={index}
                    className={`${styles.partCard} ${index === currentPartIndex ? styles.partCardActive : ''}`}
                    onClick={() => goToPart(index)}
                  >
                    <div className={styles.partType}>{part.type}</div>
                    <div className={styles.partPreview}>
                      {part.lines.slice(0, 2).map((line, i) => {
                        const { text: cleanText } = extractChordsFromLine(line.text)
                        return (
                          <div key={i} className={styles.previewLine}>
                            {cleanText || '♫'}
                          </div>
                        )
                      })}
                    </div>
                  </button>
                ))}
              </div>

              {/* Current Part Display */}
              <div className={styles.currentPart}>
                <h3>{currentSong.parts[currentPartIndex]?.type}</h3>
                <div className={styles.lyrics}>
                  {currentSong.parts[currentPartIndex]?.lines.map((line, i) => {
                    const { text: cleanText, chords } = extractChordsFromLine(line.text)
                    return (
                      <div key={i} className={styles.line}>
                        {chords.length > 0 && (
                          <div className={styles.chords}>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {chords.map((c: any, j: number) => (
                              <span key={j}>{renderChord(c.chord)}</span>
                            ))}
                          </div>
                        )}
                        <div className={styles.lyricText}>{cleanText}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.noSong}>
              <h2>No Song Selected</h2>
              <p>Select a song from the playlist or search to begin.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
