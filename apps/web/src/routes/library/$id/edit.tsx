import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSong, useUpdateSong } from '@/hooks/useSongs'
import { SongEditor } from '@/components/SongEditor/SongEditor'
import type { Song } from '@laudasist/shared'

export const Route = createFileRoute('/library/$id/edit')({
    component: EditSongPage,
})

function EditSongPage() {
    const { id } = Route.useParams()
    const { data: song, isLoading } = useSong(id)
    const updateSong = useUpdateSong(id)
    const navigate = useNavigate()

    const handleSave = async (updatedSong: Song) => {
        try {
            await updateSong.mutateAsync(updatedSong)
            navigate({ to: '/library/$id', params: { id } })
        } catch (error) {
            console.error('Failed to update song:', error)
            alert('Failed to update song')
        }
    }

    if (isLoading) return <div className="p-8">Loading...</div>
    if (!song) return <div className="p-8">Song not found</div>

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <SongEditor
                song={song}
                onSave={handleSave}
                onCancel={() => navigate({ to: '/library/$id', params: { id } })}
            />
        </div>
    )
}

