import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useSongs } from '@/hooks/useSongs'
import { Song, SongPart } from '@laudasist/shared'

export const Route = createFileRoute('/library/')({
    component: LibraryPage,
})

function LibraryPage() {
    const [search, setSearch] = useState('')
    const { data: songs, isLoading, error } = useSongs({ search })

    if (isLoading) {
        return <div className="p-8">Loading library...</div>
    }

    if (error) {
        return (
            <div className="p-8 text-red-500">
                Error loading songs: {(error as Error).message}
            </div>
        )
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <Link
                    to="/dashboard"
                    style={{
                        color: '#666',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '1rem',
                        fontSize: '0.9rem',
                    }}
                >
                    ← Back to Dashboard
                </Link>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                    }}
                >
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>My Library</h1>

                    <div
                        style={{
                            display: 'flex',
                            gap: '1rem',
                            flex: 1,
                            justifyContent: 'flex-end',
                            minWidth: '300px',
                        }}
                    >
                        <input
                            type="text"
                            placeholder="Search title, lyrics, author..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                padding: '0.75rem',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                maxWidth: '300px',
                                width: '100%',
                            }}
                        />
                        <Link
                            to="/library/new"
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: '#0070f3',
                                color: 'white',
                                borderRadius: '4px',
                                textDecoration: 'none',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            + Add Song
                        </Link>
                    </div>
                </div>
            </div>

            {!songs?.data || songs.data.length === 0 ? (
                <div
                    style={{
                        textAlign: 'center',
                        padding: '4rem',
                        background: '#f5f5f5',
                        borderRadius: '8px',
                    }}
                >
                    <p style={{ color: '#666', marginBottom: '1rem' }}>No songs found.</p>
                    {search ? (
                        <button
                            onClick={() => setSearch('')}
                            style={{
                                color: '#0070f3',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            Clear search
                        </button>
                    ) : (
                        <Link to="/library/new" style={{ color: '#0070f3' }}>
                            Create your first song
                        </Link>
                    )}
                </div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gap: '1rem',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    }}
                >
                    {songs.data.map((song) => (
                        <Link
                            key={song.id}
                            to="/library/$id"
                            params={{ id: song.id }}
                            style={{
                                background: 'white',
                                padding: '1.5rem',
                                borderRadius: '8px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                border: '1px solid #eee',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                textDecoration: 'none',
                                color: 'inherit',
                                transition: 'box-shadow 0.2s, transform 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow =
                                    '0 4px 12px rgba(0,0,0,0.1)'
                                e.currentTarget.style.transform = 'translateY(-2px)'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow =
                                    '0 2px 4px rgba(0,0,0,0.05)'
                                e.currentTarget.style.transform = 'translateY(0)'
                            }}
                        >
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                                    {song.title}
                                </h3>
                                <p style={{ color: '#666', fontSize: '0.9rem' }}>
                                    {song.author || 'Unknown Author'}
                                </p>
                            </div>

                            {/* Lyrics Snippet */}
                            <div
                                style={{
                                    background: '#f9f9f9',
                                    padding: '0.75rem',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    color: '#555',
                                    fontStyle: 'italic',
                                    lineHeight: '1.4',
                                    flex: 1,
                                }}
                            >
                                {getLyricsSnippet(song, search)}
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '0.8rem',
                                    color: '#888',
                                    marginTop: 'auto',
                                }}
                            >
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <span
                                        style={{
                                            background: '#eee',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '4px',
                                        }}
                                    >
                                        {song.originalKey}
                                    </span>
                                </div>
                                <span>{new Date(song.createdAt).toLocaleDateString()}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

function getLyricsSnippet(song: Song, searchTerm: string) {
    if (!song.parts) return null

    // Flatten all lines
    const allLines: string[] = []
    song.parts.forEach((p: SongPart) => {
        p.lines.forEach((l) => {
            allLines.push(l.text)
        })
    })

    if (allLines.length === 0) return 'No lyrics available'

    let startIndex = 0

    // If searching, try to find the match
    if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const foundIndex = allLines.findIndex((line) =>
            line.toLowerCase().includes(term),
        )
        if (foundIndex !== -1) {
            startIndex = foundIndex
        }
    }

    // Slice 3 lines
    const snippetLines = allLines.slice(startIndex, startIndex + 3)

    return (
        <>
            {snippetLines.map((line, i) => (
                <div
                    key={i}
                    style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <HighlightedText text={line} highlight={searchTerm} />
                </div>
            ))}
            {startIndex + 3 < allLines.length && <span>...</span>}
        </>
    )
}

function HighlightedText({
    text,
    highlight,
}: {
    text: string
    highlight: string
}) {
    if (!highlight.trim()) return <>{text}</>

    const parts = text.split(new RegExp(`(${highlight})`, 'gi'))
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span
                        key={i}
                        style={{ backgroundColor: '#fff0b3', fontWeight: 'bold' }}
                    >
                        {part}
                    </span>
                ) : (
                    part
                ),
            )}
        </span>
    )
}
