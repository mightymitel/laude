import { createFileRoute, Link } from '@tanstack/react-router'
import { useSong, useUpdateSong } from '@/hooks/useSongs'
import { useAuth } from '@/contexts/AuthContext'
import { SongViewer } from '@/components/songs/SongViewer'
import layout from '@/styles/Layout.module.css'
import styles from './song-detail.module.css'

export const Route = createFileRoute('/library/$id/')({
    component: SongDetailPage,
})

function SongDetailPage() {
    const { id } = Route.useParams()
    const { data: song, isLoading, error } = useSong(id)
    const { firebaseUser } = useAuth()
    const updateSong = useUpdateSong(id)

    if (isLoading) return <div className={layout.stateMessage}>Loading song...</div>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error) return <div className={layout.errorMessage}>Error: {(error as any).message}</div>
    if (!song) return <div className={layout.stateMessage}>Song not found</div>

    // Publish to community (DEC-108): an owner-only visibility flip. The api
    // mirrors it onto the denormalized song_lyrics copy, which is what makes
    // the song findable in presenter search (DEC-39).
    const isOwner = firebaseUser !== null && song.ownerId === firebaseUser.uid
    const isPublic = song.visibility === 'public'

    return (
        <div className={layout.pageContainer}>
            <div className={layout.pageHeader}>
                <Link to="/library" className={styles.backLink}>
                    ← Back to Library
                </Link>
                <div className={layout.pageActions}>
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

            <SongViewer song={song} />
        </div>
    )
}
