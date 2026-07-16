import { useEffect, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import type { Key, Song } from '@laudasist/shared'
import { useSong, useUpdateSong } from '@/hooks/useSongs'
import { useAuth } from '@/contexts/AuthContext'
import { useOnline } from '@/hooks/useOnline'
import { useRecordRecent } from '@/hooks/useLocalLibrary'
import { getLocalSongByGlobalId } from '@/lib/localLibrary'
import { SongViewer } from '@/components/songs/SongViewer'
import { PersonalNotes } from '@/components/songs/PersonalNotes'
import { ShareButton } from '@/components/ShareButton'
import { useSaveSongPref, useSongPrefs } from '@/hooks/useSongPrefs'
import { asKey } from '@/lib/keys'
import layout from '@/styles/Layout.module.css'
import styles from './song-detail.module.css'

export const Route = createFileRoute('/library/$id/')({
    component: SongDetailPage,
})

function SongDetailPage() {
    const { id } = Route.useParams()
    const navigate = useNavigate()
    const online = useOnline()
    const { data: remoteSong, isLoading, error } = useSong(id, { enabled: online })
    const { firebaseUser } = useAuth()
    const updateSong = useUpdateSong(id)
    const recordRecent = useRecordRecent()

    // Per-song personal overlay (WP-162): favoriteKey seeds the transpose
    // select; notes render below the header. Signed-out users see neither.
    const { data: songPrefs, isLoading: prefsLoading } = useSongPrefs()
    const savePref = useSaveSongPref()
    const pref = songPrefs?.[id]

    // Recents (WP-158): opening a song caches it for offline (LRU class).
    useEffect(() => {
        if (remoteSong) recordRecent(remoteSong)
        // recordRecent is a stable closure over the query client.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remoteSong?.id, remoteSong?.updatedAt])

    // Offline / fetch-failure fallback (WP-157): the local copy, if we have one.
    const [localSong, setLocalSong] = useState<Song | null>(null)
    const needLocal = !online || error !== null
    useEffect(() => {
        if (!needLocal) return
        let cancelled = false
        getLocalSongByGlobalId(id)
            .then((s) => {
                if (!cancelled) setLocalSong(s)
            })
            .catch((err: unknown) => console.warn('local song lookup failed', err))
        return () => {
            cancelled = true
        }
    }, [id, needLocal])

    const song = remoteSong ?? (needLocal ? localSong : null)
    const isLocalView = !remoteSong && localSong !== null

    if (online && isLoading) return <div className={layout.stateMessage}>Loading song...</div>
    if (!song && needLocal) {
        return (
            <div className={layout.stateMessage}>
                📴 This song is not available offline. Download it while online to keep it
                with you. <Link to="/library">Back to Library</Link>
            </div>
        )
    }
    if (error && !isLocalView) {
        return <div className={layout.errorMessage}>Error: {error instanceof Error ? error.message : 'failed to load'}</div>
    }
    if (!song) return <div className={layout.stateMessage}>Song not found</div>

    // Publish to community (DEC-108): an owner-only visibility flip. The api
    // mirrors it onto the denormalized song_lyrics copy, which is what makes
    // the song findable in presenter search (DEC-39).
    const isOwner = firebaseUser !== null && song.ownerId === firebaseUser.uid
    const isPublic = song.visibility === 'public'

    return (
        <div className={layout.pageContainer}>
            {isLocalView && (
                <div
                    data-testid="offline-song-banner"
                    style={{
                        marginBottom: '1rem',
                        padding: '0.6rem 1rem',
                        borderRadius: '8px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.9rem',
                    }}
                >
                    📴 Offline copy from your local library.
                </div>
            )}
            <div className={layout.pageHeader}>
                <Link to="/library" className={styles.backLink}>
                    ← Back to Library
                </Link>
                <div className={layout.pageActions}>
                    {/* Share only PUBLIC songs (WP-159) — imports default private (DEC-108). */}
                    {song.visibility === 'public' && !isLocalView && (
                        <ShareButton
                            testId="share-song"
                            className={styles.editButton}
                            payload={{
                                title: `${song.title} — Laudasist`,
                                text: `${song.title}${song.author ? ` — ${song.author}` : ''} · on Laudasist`,
                                url: `${window.location.origin}/library/${song.id}`,
                            }}
                        />
                    )}
                    <button
                        className={styles.editButton}
                        data-testid="start-session-with-song"
                        onClick={() =>
                            void navigate({
                                to: '/session',
                                search: { guest: false, songId: id },
                            })
                        }
                    >
                        ▶ Start session with this song
                    </button>
                    {isOwner && (
                        <button
                            className={styles.editButton}
                            data-testid="publish-toggle"
                            disabled={updateSong.isPending}
                            onClick={() =>
                                updateSong.mutate({ visibility: isPublic ? 'private' : 'public' })
                            }
                        >
                            {isPublic ? '🔒 Make private' : '🌍 Publish to community'}
                        </button>
                    )}
                    {isOwner && (
                        <Link
                            to="/library/$id/edit"
                            params={{ id }}
                            className={styles.editButton}
                        >
                            ✏️ Edit Song
                        </Link>
                    )}
                </div>
            </div>

            {firebaseUser !== null && (
                <PersonalNotes
                    notes={pref?.notes}
                    saving={savePref.isPending}
                    onSave={(notes) => savePref.mutate({ songId: id, notes })}
                />
            )}

            {/* Rendered once prefs settle so initialKey seeds from favoriteKey;
                keyed per song so navigating songs re-seeds. ★ toggles update
                the favoriteKey prop live without remounting. */}
            {(firebaseUser === null || !prefsLoading) && (
                <SongViewer
                    key={song.id}
                    song={song}
                    initialKey={pref?.favoriteKey !== undefined ? asKey(pref.favoriteKey) : song.defaultKey}
                    favoriteKey={pref?.favoriteKey !== undefined ? asKey(pref.favoriteKey) : null}
                    {...(firebaseUser !== null
                        ? {
                              onFavoriteKeyChange: (key: Key | null) =>
                                  savePref.mutate({ songId: id, favoriteKey: key }),
                          }
                        : {})}
                />
            )}
        </div>
    )
}
