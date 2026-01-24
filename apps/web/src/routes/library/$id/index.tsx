import { createFileRoute, Link } from '@tanstack/react-router'
import { useSong } from '@/hooks/useSongs'
import { SongViewer } from '@/components/songs/SongViewer'
import layout from '@/styles/Layout.module.css'
import styles from './song-detail.module.css'

export const Route = createFileRoute('/library/$id/')({
    component: SongDetailPage,
})

function SongDetailPage() {
    const { id } = Route.useParams()
    const { data: song, isLoading, error } = useSong(id)

    if (isLoading) return <div className={layout.stateMessage}>Loading song...</div>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error) return <div className={layout.errorMessage}>Error: {(error as any).message}</div>
    if (!song) return <div className={layout.stateMessage}>Song not found</div>

    return (
        <div className={layout.pageContainer}>
            <div className={layout.pageHeader}>
                <Link to="/library" className={styles.backLink}>
                    ← Back to Library
                </Link>
                <div className={layout.pageActions}>
                    <Link
                        to="/library/$id/edit"
                        params={{ id }}
                        className={styles.editButton}
                    >
                        ✏️ Edit Song
                    </Link>
                </div>
            </div>

            <SongViewer song={song} />
        </div>
    )
}
