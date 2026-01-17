import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, FormEvent } from 'react'
import { useSong, useUpdateSong } from '@/hooks/useSongs'
import { parseSongFromMarkdown, embedChordsInLine, Key, ParsedSong } from '@laudasist/shared'
import styles from '@/components/songs/QuickAddForm.module.css'

const POSSIBLE_KEYS: Key[] = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F']

export const Route = createFileRoute('/library/$id/edit')({
    component: EditSongPage,
})

function EditSongPage() {
    const { id } = Route.useParams()
    const { data: song, isLoading } = useSong(id)
    const updateSong = useUpdateSong(id)
    const navigate = useNavigate()

    const [title, setTitle] = useState('')
    const [author, setAuthor] = useState('')
    const [key, setKey] = useState<Key>('C')
    const [content, setContent] = useState('')
    const [preview, setPreview] = useState<ParsedSong | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [initialized, setInitialized] = useState(false)

    // Initialize form when song loads
    useEffect(() => {
        if (song && !initialized) {
            setTitle(song.title)
            setAuthor(song.author || '')
            setKey(song.originalKey)
            // Convert parts back to markdown-like content
            const contentLines: string[] = []
            song.parts.forEach((part) => {
                contentLines.push(`# ${part.type}${part.index > 0 ? ' ' + part.index : ''}`)
                part.lines.forEach((line) => contentLines.push(line.text))
                contentLines.push('')
            })
            setContent(contentLines.join('\n').trim())
            setInitialized(true)
        }
    }, [song, initialized])

    // Live parse preview
    useEffect(() => {
        if (!content) {
            setPreview(null)
            return
        }
        try {
            const parsed = parseSongFromMarkdown(content, key)
            setPreview(parsed)
        } catch (e) {
            console.error(e)
        }
    }, [content, key])

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        if (!title || !content || !preview) return

        try {
            const songParts = preview.parts.map((p) => ({
                id: crypto.randomUUID(),
                type: p.type,
                index: p.index,
                lines: p.lines.map((l) => ({
                    text: embedChordsInLine(l.text, l.chords),
                })),
            }))

            await updateSong.mutateAsync({
                title,
                author,
                originalKey: key,
                parts: songParts,
            })
            navigate({ to: '/library/$id', params: { id } })
        } catch (err) {
            setError('Failed to update song: ' + (err as Error).message)
        }
    }

    if (isLoading) return <div className="p-8">Loading...</div>
    if (!song) return <div className="p-8">Song not found</div>

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1rem' }}>
                <Link to="/library/$id" params={{ id }} style={{ color: '#666', textDecoration: 'none' }}>
                    ← Cancel
                </Link>
            </div>

            <h1 style={{ marginBottom: '2rem' }}>Edit Song</h1>

            <div className={styles.container}>
                <form onSubmit={handleSubmit} className={styles.formColumn}>
                    <div className={styles.inputGroup}>
                        <label>Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            className={styles.inputField}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Author</label>
                        <input
                            type="text"
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            className={styles.inputField}
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Original Key</label>
                        <select
                            value={key}
                            onChange={(e) => setKey(e.target.value as Key)}
                            className={styles.inputField}
                        >
                            {POSSIBLE_KEYS.map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Content (Markdown with chords)</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={20}
                            className={styles.textareaField}
                            placeholder="# Verse 1&#10;[C] Amazing [G] grace"
                        />
                    </div>

                    {error && <div style={{ color: 'red' }}>{error}</div>}

                    <button
                        type="submit"
                        disabled={updateSong.isPending}
                        className={styles.submitButton}
                    >
                        {updateSong.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </form>

                <div className={styles.previewColumn}>
                    <h3>Preview</h3>
                    {preview &&
                        preview.parts.map((part, i) => (
                            <div key={i} style={{ marginBottom: '1rem' }}>
                                <strong>
                                    {part.type} {part.index > 0 && part.index}
                                </strong>
                                {part.lines.map((line, j) => (
                                    <div key={j}>{line.text}</div>
                                ))}
                            </div>
                        ))}
                </div>
            </div>
        </div>
    )
}
