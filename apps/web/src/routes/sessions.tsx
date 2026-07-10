/**
 * My sessions (Flow 3, DEC-96/99): the NARROW persisted session — a named,
 * owner-scoped document holding a playlist by-value. Prepare days ahead in
 * /session (💾 Save session), open it again on the night, Go Live mints
 * fresh links every time. No lifecycle, no church scoping, no comments —
 * deliberately (those stay with Flow 4). English copy per DEC-18.
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/contexts/AuthContext'
import {
  useDeleteSavedSession,
  useSavedSessions,
  useUpdateSavedSession,
  type SavedSession,
} from '@/hooks/useSavedSessions'
import styles from './playlists.module.css'

export const Route = createFileRoute('/sessions')({
  component: SessionsPage,
})

function dateOf(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString()
}

function SessionCard({ saved }: { saved: SavedSession }) {
  const navigate = useNavigate()
  const deleteSession = useDeleteSavedSession()
  const updateSession = useUpdateSavedSession()

  return (
    <div className={styles.card} data-testid="saved-session-card">
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>{saved.name}</span>
        <span className={styles.songCount}>
          {saved.items.length} {saved.items.length === 1 ? 'song' : 'songs'} · {dateOf(saved.updatedAt)}
        </span>
      </div>
      <div className={styles.songList}>
        {saved.items.slice(0, 4).map((item) => (
          <div key={item.id}>
            {item.song?.title ?? item.songId}
            {item.key ? <span className={styles.key}> · {item.key}</span> : null}
          </div>
        ))}
        {saved.items.length > 4 && (
          <div className={styles.more}>+{saved.items.length - 4} more…</div>
        )}
      </div>
      <div className={styles.cardActions}>
        <button
          className={styles.startBtn}
          onClick={() =>
            void navigate({
              to: '/session',
              search: { guest: false, playlistId: undefined, savedSessionId: saved.id },
            })
          }
        >
          ▶ Open session
        </button>
        <button
          className={styles.deleteBtn}
          title="Rename"
          onClick={() => {
            const name = window.prompt('Rename session:', saved.name)
            if (name && name.trim() !== '' && name !== saved.name) {
              updateSession.mutate({ id: saved.id, name: name.trim() })
            }
          }}
        >
          ✏️
        </button>
        <button
          className={styles.deleteBtn}
          onClick={() => {
            if (window.confirm(`Delete session "${saved.name}"?`)) {
              deleteSession.mutate(saved.id)
            }
          }}
        >
          🗑
        </button>
      </div>
    </div>
  )
}

function SessionsPage() {
  const { user, loading: authLoading } = useAuth()
  const { data: sessions, isLoading } = useSavedSessions()

  if (authLoading) {
    return <div className={styles.loading}>Loading…</div>
  }
  if (!user) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>My sessions</h1>
        </div>
        <p className={styles.subtitle}>
          Saved sessions live on your account. <Link to="/login" search={{ redirect: undefined }}>Sign in</Link> to prepare an
          evening days ahead — or start a{' '}
          <Link to="/session" search={{ guest: true, playlistId: undefined, savedSessionId: undefined }}>
            quick session
          </Link>{' '}
          right now.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My sessions</h1>
          <p className={styles.subtitle}>
            A saved session is one prepared evening: name + set list. Open it again on the night —
            Go Live mints fresh links every time.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link
            to="/session"
            search={{ guest: false, playlistId: undefined, savedSessionId: undefined }}
            className={styles.createBtn}
          >
            + New session
          </Link>
          <Link to="/dashboard" className={styles.backLink}>
            ← Dashboard
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading sessions…</div>
      ) : (
        <div className={styles.grid}>
          {(sessions ?? []).map((saved) => (
            <SessionCard key={saved.id} saved={saved} />
          ))}
          {(sessions ?? []).length === 0 && (
            <p className={styles.subtitle}>
              No saved sessions yet. Build a set in a session and hit 💾 Save session.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
