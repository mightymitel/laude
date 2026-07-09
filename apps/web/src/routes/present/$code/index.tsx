import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState, useCallback } from 'react'
import { useSessionConnection } from '@/hooks/useSessionConnection'
import { useCommunitySongs } from '@/hooks/useCommunitySongs'
import { loadPresenter } from '@/lib/presenter'
import { extractChordsFromLine, formatChord } from '@laudasist/shared'
import type { Song } from '@laudasist/shared'
import type { EmbeddedSong, SessionPlaylistItem } from '@laude/session'
import { asKey } from '@/lib/keys'
import styles from './present.module.css'

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
      <span className={styles.songKey}>{item.key || song?.defaultKey || '?'}</span>
    </button>
  )
}

function embed(song: Song): EmbeddedSong {
  return {
    id: song.id,
    title: song.title,
    author: song.author,
    defaultKey: song.defaultKey,
    parts: song.parts,
  }
}

function PresenterPage() {
  const { code } = Route.useParams()

  // One connection to the relay: join with the presenter code from the link
  // (role comes from the code); the snapshot arrives on join, deltas stream
  // over state:sync.
  const presenter = useMemo(() => loadPresenter(), [])
  const { state: session, client, connected, error } = useSessionConnection(code, presenter)

  // Local state for UI (search)
  const [searchQuery, setSearchQuery] = useState('')
  const { data: searchResults } = useCommunitySongs({ search: searchQuery || undefined })

  // --- ACTIONS ---

  const selectSong = useCallback((item: SessionPlaylistItem) => {
    if (!item.song || !client) return
    client.send({
      current: {
        song_id: item.song.id,
        section_index: 0,
        key: item.key || item.song.defaultKey,
      },
      currentSong: item.song,
    })
  }, [client])

  const goToPart = useCallback((index: number) => {
    client?.setCurrent({ section_index: index })
  }, [client])

  const currentSong = session?.currentSong ?? null
  const currentPartIndex = session?.current.section_index ?? 0
  const displayKey = asKey(session?.current.key ?? currentSong?.defaultKey ?? null)

  const nextPart = useCallback(() => {
    if (currentSong && currentPartIndex < currentSong.parts.length - 1) {
      goToPart(currentPartIndex + 1)
    }
  }, [currentSong, currentPartIndex, goToPart])

  const prevPart = useCallback(() => {
    if (currentPartIndex > 0) goToPart(currentPartIndex - 1)
  }, [currentPartIndex, goToPart])

  const selectCommunitySong = (song: Song) => {
    setSearchQuery('')
    client?.send({
      current: { song_id: song.id, section_index: 0, key: song.defaultKey },
      currentSong: embed(song),
    })
  }

  // --- RENDERING ---

  if (!session && !error) {
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
      {!connected && (
        <div className={styles.connectionWarning}>
          ⚠️ Connection to the session relay lost — reconnecting…
        </div>
      )}

      <header className={styles.header}>
        <h1>Presenter View</h1>
        <div className={styles.sessionInfo}>
          <span>Viewer Code: <strong>{session.accessCode}</strong></span>
        </div>
      </header>

      <div className={styles.layout}>
        {/* Sidebar with Playlist and Search */}
        <aside className={styles.sidebar}>
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
                    <span className={styles.songKey}>{song.defaultKey}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.sidebarHeader}>
            <h3>📋 Session Playlist</h3>
          </div>

          {session.sessionPlaylist.length > 0 ? (
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
                            {chords.map((c, j) => (
                              <span key={j}>{formatChord(c.chord, displayKey, 'letters')}</span>
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
