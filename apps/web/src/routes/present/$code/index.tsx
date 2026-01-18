import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { api } from '@/lib/api'
import { useSong } from '@/hooks/useSongs'
import { formatChord, extractChordsFromLine } from '@laudasist/shared'
import type { Key, ChordStyle } from '@laudasist/shared'
import styles from './present.module.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface SessionPlaylistItem {
  id: string
  songId: string
  key?: Key
  arrangement?: string
  isExternal?: boolean
}

interface PresenterSession {
  id: string
  accessCode: string
  presenterCode: string
  status: 'active' | 'ended'
  currentSongId: string | null
  currentPartIndex: number
  displayKey: Key
  chordStyle: ChordStyle
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
  const { data: song } = useSong(item.songId)

  return (
    <button
      className={`${styles.playlistItem} ${isActive ? styles.playlistItemActive : ''}`}
      onClick={onClick}
    >
      <span className={styles.songTitle}>{song?.title || 'Loading...'}</span>
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

  // Current song state
  const [currentSongId, setCurrentSongId] = useState<string | null>(null)
  const [currentPartIndex, setCurrentPartIndex] = useState(0)
  const [displayKey, setDisplayKey] = useState<Key>('C')

  // Get song data
  const { data: currentSong } = useSong(currentSongId || '')

  // Fetch session on mount
  useEffect(() => {
    async function fetchSession() {
      try {
        const data = await api.get<PresenterSession>(`/api/sessions/presenter/${code}`)
        setSession(data)
        setCurrentSongId(data.currentSongId)
        setCurrentPartIndex(data.currentPartIndex)
        setDisplayKey(data.displayKey)

        // Connect to socket
        const socket = io(API_URL)
        socketRef.current = socket
        socket.emit('session:join', data.accessCode)

        // Listen for updates from owner
        socket.on('session:state', (update) => {
          if (update.songId !== undefined) setCurrentSongId(update.songId)
          if (update.partIndex !== undefined) setCurrentPartIndex(update.partIndex)
          if (update.key !== undefined) setDisplayKey(update.key)
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
        setSession((prev) => prev ? { ...prev, sessionPlaylist: data.sessionPlaylist || [] } : null)
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
  const broadcastUpdate = useCallback((songId: string | null, partIndex: number, key: Key) => {
    if (!session || !socketRef.current) return

    socketRef.current.emit('session:update', {
      accessCode: session.accessCode,
      songId,
      partIndex,
      key,
    })

    // Also update via API
    api.put(`/api/sessions/presenter/${code}`, {
      currentSongId: songId,
      currentPartIndex: partIndex,
      displayKey: key,
    }).catch(console.error)
  }, [session, code])

  // Select song from playlist
  const selectSong = useCallback((item: SessionPlaylistItem) => {
    setCurrentSongId(item.songId)
    setCurrentPartIndex(0)
    if (item.key) {
      setDisplayKey(item.key)
    }
    broadcastUpdate(item.songId, 0, item.key || displayKey)
  }, [broadcastUpdate, displayKey])

  // Navigate parts
  const goToPart = useCallback((index: number) => {
    setCurrentPartIndex(index)
    broadcastUpdate(currentSongId, index, displayKey)
  }, [broadcastUpdate, currentSongId, displayKey])

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
        {/* Playlist Panel */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3>📋 Session Playlist</h3>
          </div>

          {(session.sessionPlaylist?.length ?? 0) > 0 ? (
            <div className={styles.playlistList}>
              {session.sessionPlaylist.map((item) => (
                <PlaylistItemRow
                  key={item.id}
                  item={item}
                  isActive={item.songId === currentSongId}
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
              <p>Select a song from the playlist to begin.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
