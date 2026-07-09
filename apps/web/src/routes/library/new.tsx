import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { SongEditor } from '@/components/SongEditor/SongEditor'
import { useCreateSong } from '@/hooks/useSongs'
import { api } from '@/lib/api'
import type { SongPart, Key, Song } from '@laudasist/shared'
import styles from './new.module.css'

interface ImportedSong {
    title: string
    author?: string
    defaultKey: Key
    parts: SongPart[]
    sourceUrl: string
}

export const Route = createFileRoute('/library/new')({
    component: NewSongPage,
})

function NewSongPage() {
    const navigate = useNavigate()
    const createSong = useCreateSong()

    const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual')
    const [importUrl, setImportUrl] = useState('')
    const [importing, setImporting] = useState(false)
    const [importError, setImportError] = useState<string | null>(null)
    const [importedSong, setImportedSong] = useState<ImportedSong | null>(null)

    const handleImportPreview = async () => {
        if (!importUrl.trim()) return

        setImporting(true)
        setImportError(null)
        setImportedSong(null)

        try {
            const result = await api.post<ImportedSong>('/api/import/preview', {
                url: importUrl,
            })
            setImportedSong(result)
        } catch (error) {
            setImportError(error instanceof Error ? error.message : 'Failed to import')
        } finally {
            setImporting(false)
        }
    }

    const handleSave = async (song: Song) => {
        try {
            const result = await createSong.mutateAsync(song)
            navigate({ to: '/library/$id', params: { id: result.id } })
        } catch (error) {
            console.error('Failed to save song:', error)
            alert('Failed to save song')
        }
    }

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Add New Song</h1>

            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'manual' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('manual')}
                >
                    ✏️ Manual Entry
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'import' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('import')}
                >
                    🔗 Import from URL
                </button>
            </div>

            <div className={styles.content}>
                {activeTab === 'manual' && (
                    <div className={styles.card}>
                        <SongEditor
                            onSave={handleSave}
                            onCancel={() => navigate({ to: '/library' })}
                        />
                    </div>
                )}

                {activeTab === 'import' && (
                    <div className={styles.card}>
                        <div className={styles.importSection}>
                            <label className={styles.label}>Song URL</label>
                            <p className={styles.hint}>
                                Supported: melodia.ro, resursecrestine.ro
                            </p>
                            <div className={styles.inputRow}>
                                <input
                                    type="url"
                                    value={importUrl}
                                    onChange={(e) => setImportUrl(e.target.value)}
                                    placeholder="https://melodia.ro/songs/..."
                                    className={styles.input}
                                />
                                <button
                                    onClick={handleImportPreview}
                                    disabled={importing || !importUrl.trim()}
                                    className={styles.importButton}
                                    style={{ opacity: importing || !importUrl.trim() ? 0.5 : 1 }}
                                >
                                    {importing ? 'Loading...' : 'Preview'}
                                </button>
                            </div>

                            {importError && (
                                <div className={styles.error}>{importError}</div>
                            )}

                            {importedSong && (
                                <div className={styles.preview}>
                                    <h3>{importedSong.title}</h3>
                                    {importedSong.author && (
                                        <p className={styles.author}>by {importedSong.author}</p>
                                    )}
                                    <p className={styles.key}>Key: {importedSong.defaultKey}</p>
                                    <p className={styles.parts}>
                                        {importedSong.parts.length} parts found
                                    </p>

                                    <div className={styles.editorContainer} style={{ marginTop: '2rem' }}>
                                        <SongEditor
                                            song={importedSong as unknown as Song}
                                            onSave={handleSave}
                                            onCancel={() => {
                                                setImportedSong(null)
                                                setImportUrl('')
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

