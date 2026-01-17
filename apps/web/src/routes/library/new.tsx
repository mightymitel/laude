import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { QuickAddForm } from '@/components/songs/QuickAddForm'
import { api } from '@/lib/api'
import type { SongPart, Key } from '@laudasist/shared'
import styles from './new.module.css'

interface ImportedSong {
    title: string
    author?: string
    originalKey: Key
    parts: SongPart[]
    sourceUrl: string
}

export const Route = createFileRoute('/library/new')({
    component: NewSongPage,
})

function NewSongPage() {
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
                        <QuickAddForm />
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
                                    <p className={styles.key}>Key: {importedSong.originalKey}</p>
                                    <p className={styles.parts}>
                                        {importedSong.parts.length} parts found
                                    </p>

                                    <div className={styles.previewLyrics}>
                                        {importedSong.parts.slice(0, 2).map((part, i) => (
                                            <div key={i} className={styles.previewPart}>
                                                <strong>
                                                    {part.type} {part.index}
                                                </strong>
                                                {part.lines.slice(0, 3).map((line, j) => (
                                                    <div key={j}>{line.text}</div>
                                                ))}
                                                {part.lines.length > 3 && <div>...</div>}
                                            </div>
                                        ))}
                                    </div>

                                    <QuickAddForm
                                        initialData={{
                                            title: importedSong.title,
                                            author: importedSong.author || '',
                                            originalKey: importedSong.originalKey,
                                            content: importedSong.parts
                                                .map((p) => {
                                                    const partName =
                                                        p.type.charAt(0).toUpperCase() + p.type.slice(1)
                                                    return `#${partName} ${p.index}\n${p.lines.map((l) => l.text).join('\n')}`
                                                })
                                                .join('\n\n'),
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
