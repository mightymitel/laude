/**
 * Saved playlists (Flows 3/4): the prepared side of a session. Create days
 * ahead, add songs (from any session's Save, or here), then "Open in session"
 * — /session?playlistId= loads the items into the session playlist and Go
 * Live mints fresh links each time. English copy per DEC-18.
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  useCreatePlaylist,
  useDeletePlaylist,
  usePlaylists,
  type Playlist,
} from '@/hooks/usePlaylists'
import styles from './playlists.module.css'

export const Route = createFileRoute('/playlists')({
  component: PlaylistsPage,
})

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const navigate = useNavigate()
  const deletePlaylist = useDeletePlaylist()

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>{playlist.name}</span>
        <span className={styles.songCount}>
          {playlist.items.length} {playlist.items.length === 1 ? 'song' : 'songs'}
        </span>
      </div>
      <div className={styles.songList}>
        {playlist.items.slice(0, 4).map((item) => (
          <div key={item.id}>
            {item.song?.title ?? item.songId}
            {item.key ? <span className={styles.key}> · {item.key}</span> : null}
          </div>
        ))}
        {playlist.items.length > 4 && (
          <div className={styles.more}>+{playlist.items.length - 4} more…</div>
        )}
      </div>
      <div className={styles.cardActions}>
        <button
          className={styles.startBtn}
          onClick={() =>
            void navigate({ to: '/session', search: { guest: false, playlistId: playlist.id } })
          }
        >
          ▶ Open in session
        </button>
        <button
          className={styles.deleteBtn}
          onClick={() => {
            if (window.confirm(`Delete playlist "${playlist.name}"?`)) {
              deletePlaylist.mutate(playlist.id)
            }
          }}
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function PlaylistsPage() {
  const { user, loading: authLoading } = useAuth()
  const { data: playlists, isLoading } = usePlaylists()
  const createPlaylist = useCreatePlaylist()
  const [newName, setNewName] = useState('')

  if (authLoading) {
    return <div className={styles.loading}>Loading…</div>
  }
  if (!user) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Playlists</h1>
        </div>
        <p className={styles.subtitle}>
          Saved playlists live on your account. <Link to="/login">Sign in</Link> to prepare a
          meeting ahead of time — or start a <Link to="/session" search={{ guest: true, playlistId: undefined }}>quick session</Link> and export its playlist as a file instead.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Playlists</h1>
          <p className={styles.subtitle}>
            Prepare ahead; opening one loads it into a session — Go Live mints fresh links every
            time.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/dashboard" className={styles.backLink}>
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className={styles.headerActions}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New playlist name…"
        />
        <button
          className={styles.createBtn}
          disabled={!newName.trim() || createPlaylist.isPending}
          onClick={() => {
            createPlaylist.mutate({ name: newName.trim() })
            setNewName('')
          }}
        >
          + Create
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading playlists…</div>
      ) : (
        <div className={styles.grid}>
          {(playlists ?? []).map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
          {(playlists ?? []).length === 0 && (
            <p className={styles.subtitle}>
              No playlists yet. Create one above, or Save a session playlist from /session.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
