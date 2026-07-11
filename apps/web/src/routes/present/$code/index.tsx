import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState, useCallback } from 'react'
import { useSessionConnection } from '@/hooks/useSessionConnection'
import { useLyricsSearch } from '@/hooks/useLyricsSearch'
import { loadPresenter } from '@/lib/presenter'
import { api } from '@/lib/api'
import { extractChordsFromLine, formatChord } from '@laudasist/shared'
import type { Song } from '@laudasist/shared'
import { effectiveKeyOf, songChangeKey } from '@laude/session'
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

  // Local state for UI (search) — server-side lyrics search, debounced in
  // the hook (WP-105): lyrics are the reliable key for worship songs.
  const [searchQuery, setSearchQuery] = useState('')
  const { results: searchResults } = useLyricsSearch(searchQuery)

  // Phone-first: playlist + search live in an off-canvas drawer, closed by
  // default; on ≥1024px the CSS pins the sidebar open and hides the toggle.
  const [drawerOpen, setDrawerOpen] = useState(false)

  // --- ACTIONS ---

  const selectSong = useCallback((item: SessionPlaylistItem) => {
    if (!item.song || !client) return
    // Song-change key through the shared policy reader (WP-144/145): with
    // 'hold' the current key survives; presenters must not bypass it.
    client.send({
      current: {
        song_id: item.song.id,
        section_index: 0,
        effective_key: songChangeKey(
          session?.key_policy ?? 'adopt',
          session ? effectiveKeyOf(session) : null,
          item.key || item.song.defaultKey,
        ),
      },
      currentSong: item.song,
    })
    setDrawerOpen(false)
  }, [client, session])

  const goToPart = useCallback((index: number) => {
    client?.setCurrent({ section_index: index })
  }, [client])

  const currentSong = session?.currentSong ?? null
  // 'instrumental' (DEC-62): no part highlighted; next/prev restart from 0.
  const rawPartIndex = session?.current.section_index ?? 0
  const currentPartIndex = typeof rawPartIndex === 'number' ? rawPartIndex : -1
  // Sounding key: the broadcast effective_key via the shared reader (WP-144).
  const displayKey = asKey(session ? effectiveKeyOf(session) : null)

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
    setDrawerOpen(false)
    client?.send({
      current: {
        song_id: song.id,
        section_index: 0,
        effective_key: songChangeKey(
          session?.key_policy ?? 'adopt',
          session ? effectiveKeyOf(session) : null,
          song.defaultKey,
        ),
      },
      currentSong: embed(song),
    })
  }

  // A search hit carries metadata only; selection fetches the full song
  // (presenters search public/official — the endpoint already filtered).
  const selectSearchHit = (songId: string) => {
    api.get<Song>(`/api/community/songs/${songId}`, { skipAuth: true })
      .then((song) => selectCommunitySong(song))
      .catch((err: unknown) => console.warn('song fetch failed', err))
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
        <button
          className={styles.drawerToggle}
          onClick={() => setDrawerOpen((v) => !v)}
          aria-expanded={drawerOpen}
          data-testid="presenter-drawer-toggle"
        >
          📋 Songs
        </button>
        <h1>Presenter</h1>
        <div className={styles.sessionInfo}>
          <span>Viewers: <strong>{session.accessCode}</strong></span>
        </div>
      </header>

      <div className={styles.layout}>
        {drawerOpen && (
          <button
            className={styles.backdrop}
            aria-label="Close song list"
            onClick={() => setDrawerOpen(false)}
          />
        )}
        {/* Playlist + search: off-canvas drawer on phones, pinned on desktop */}
        <aside className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.searchPanel}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search community songs..."
              className={styles.searchInput}
            />
            {searchQuery && searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map((hit) => (
                  <button
                    key={hit.song_id}
                    className={styles.searchResultItem}
                    onClick={() => selectSearchHit(hit.song_id)}
                  >
                    <span>{hit.title}</span>
                    <span className={styles.searchSnippet}>{hit.snippet}</span>
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

              {/* One thumb-scrollable row of part chips (grid on desktop) */}
              <div className={styles.partsGrid}>
                {currentSong.parts.map((part, index) => (
                  <button
                    key={index}
                    className={`${styles.partCard} ${index === currentPartIndex ? styles.partCardActive : ''}`}
                    onClick={() => goToPart(index)}
                  >
                    <div className={styles.partType}>{part.type}</div>
                    <div className={styles.partPreview}>
                      {part.lines.slice(0, 1).map((line, i) => {
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

              {/* Current part owns the screen; scrolls internally */}
              <div className={styles.currentPart}>
                <h3>{currentSong.parts[currentPartIndex]?.type ?? 'instrumental'}</h3>
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

              {/* Sticky bottom bar: Prev/Next in thumb reach */}
              <div className={styles.partsNav}>
                <button onClick={prevPart} disabled={currentPartIndex <= 0}>
                  ← Prev
                </button>
                <span className={styles.partsNavLabel}>
                  {currentPartIndex + 1} / {currentSong.parts.length}
                </span>
                <button onClick={nextPart} disabled={currentPartIndex >= currentSong.parts.length - 1}>
                  Next →
                </button>
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
