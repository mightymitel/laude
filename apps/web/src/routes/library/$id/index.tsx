import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useSong } from '@/hooks/useSongs'
import { SongViewer } from '@/components/songs/SongViewer'

export const Route = createFileRoute('/library/$id/')({
    component: SongDetailPage,
})

function SongDetailPage() {
    const { id } = Route.useParams()
    const { data: song, isLoading, error } = useSong(id)

    if (isLoading) return <div className="p-8">Loading song...</div>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (error) return <div className="p-8 text-red-500">Error: {(error as any).message}</div>
    if (!song) return <div className="p-8">Song not found</div>

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div
                style={{
                    marginBottom: '1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <Link to="/library" style={{ color: '#666', textDecoration: 'none' }}>
                    ← Back to Library
                </Link>
                <Link
                    to="/library/$id/edit"
                    params={{ id }}
                    style={{
                        padding: '0.5rem 1rem',
                        background: '#0070f3',
                        color: 'white',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontSize: '0.9rem',
                    }}
                >
                    ✏️ Edit Song
                </Link>
            </div>

            <SongViewer song={song} />
        </div>
    )
}
