import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { api } from '@/lib/api'
import { useCommunitySongs } from '@/hooks/useCommunitySongs'
import { formatChord, extractChordsFromLine } from '@laudasist/shared'
import type { Key, SongPart } from '@laudasist/shared'
import styles from './present.module.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Embedded song data for presenter access
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

interface PresenterSession {
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
  // Use embedded song data
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
  const [session, setSession] = useState<PresenterSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const socketRef = useRef<Socket | null>(null)

  // Current song state - use embedded data from playlist/session
  const [currentSong, setCurrentSong] = useState<EmbeddedSong | null>(null)
  const [currentPartIndex, setCurrentPartIndex] = useState(0)
  const [displayKey, setDisplayKey] = useState<Key>('C')

  // Search for community/official songs
  const [searchQuery, setSearchQuery] = useState('')
  const { data: searchResults } = useCommunitySongs({ search: searchQuery || undefined })

  // Fetch session on mount
  useEffect(() => {
    async function fetchSession() {
      try {
        const data = await api.get<PresenterSession>(`/api/sessions/presenter/${code}`)
        setSession(data)
        setCurrentPartIndex(data.currentPartIndex)
        setDisplayKey(data.displayKey)

        // Set current song from embedded data
        if (data.currentSong) {
          setCurrentSong(data.currentSong)
        } else if (data.currentSongId && data.sessionPlaylist) {
          const playlistItem = data.sessionPlaylist.find(i => i.songId === data.currentSongId)
          if (playlistItem?.song) {
            setCurrentSong(playlistItem.song)
          }
        }

        // Connect to socket
        const socket = io(API_URL)
        socketRef.current = socket
        socket.emit('session:join', data.accessCode)

        // Listen for updates from owner
        socket.on('session:state', (update) => {
          if (update.partIndex !== undefined) setCurrentPartIndex(update.partIndex)
          if (update.key !== undefined) setDisplayKey(update.key)
          if (update.song) setCurrentSong(update.song)
        })

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Session not found')
      } finally {
        setLoading(false)
      }
    }

    fetchSession()

    // Poll for playlist updates every 5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const data = await api.get<PresenterSession>(`/api/sessions/presenter/${code}`)
        setSession((prev) => prev ? {
          ...prev,
          sessionPlaylist: data.sessionPlaylist || [],
          currentSong: data.currentSong,
        } : null)
        // Update current song if changed
        if (data.currentSong) {
          setCurrentSong(data.currentSong)
        }
      } catch {
        // Ignore polling errors
      }
    }, 5000)

    return () => {
      clearInterval(pollInterval)
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [code])

  // Broadcast update to viewers
  const broadcastUpdate = useCallback((song: EmbeddedSong | null, partIndex: number, key: Key) => {
    if (!session || !socketRef.current) return

    socketRef.current.emit('session:update', {
      accessCode: session.accessCode,
      songId: song?.id || null,
      partIndex,
      key,
      song,
    })

    // Also update via API
    api.put(`/api/sessions/presenter/${code}`, {
      currentSongId: song?.id || null,
      currentSong: song,
      currentPartIndex: partIndex,
      displayKey: key,
    }).catch(console.error)
  }, [session, code])

  // Select song from playlist
  const selectSong = useCallback((item: SessionPlaylistItem) => {
    if (!item.song) return
    setCurrentSong(item.song)
    setCurrentPartIndex(0)
    if (item.key) {
      setDisplayKey(item.key)
    }
    broadcastUpdate(item.song, 0, item.key || displayKey)
  }, [broadcastUpdate, displayKey])

  // Navigate parts
  const goToPart = useCallback((index: number) => {
    setCurrentPartIndex(index)
    broadcastUpdate(currentSong, index, displayKey)
  }, [broadcastUpdate, currentSong, displayKey])

  const nextPart = useCallback(() => {
    if (currentSong && currentPartIndex < currentSong.parts.length - 1) {
      goToPart(currentPartIndex + 1)
    }
  }, [currentSong, currentPartIndex, goToPart])

  const prevPart = useCallback(() => {
    if (currentPartIndex > 0) {
      goToPart(currentPartIndex - 1)
    }
  }, [currentPartIndex, goToPart])

  // Render chord with transposition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderChord = (chord: any) => {
    return formatChord(chord, displayKey, 'letters')
  }

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
    setCurrentSong(embedded)
    setCurrentPartIndex(0)
    setDisplayKey(song.originalKey)
    setSearchQuery('')
    broadcastUpdate(embedded, 0, song.originalKey)
  }

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>Connecting to session...</div></div>
  }

  if (error || !session) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Session Not Found</h2>
          <p>{error || 'Invalid presenter code'}</p>
        </div>
      </div>
    )
  }

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
              <div className={styles.songHeader}>
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
