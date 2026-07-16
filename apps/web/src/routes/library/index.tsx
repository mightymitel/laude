import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useCloneSong } from '@/hooks/useSongs'
import { useAuth } from '@/contexts/AuthContext'
import { useOnline } from '@/hooks/useOnline'
import { useDownloadSong, useRemoveDownload } from '@/hooks/useLocalLibrary'
import { useLibraryResults, type ContentLanguage, type TieredSong } from '@/hooks/useLibraryResults'
import { LanguageFilter } from '@/components/LanguageFilter'
import { Song, SongPart } from '@laudasist/shared'

export const Route = createFileRoute('/library/')({
    component: LibraryPage,
})

/** Incremental windowing for the browse list (DEC-145): cards are cheap,
 * the working set is local — page in slices as the sentinel scrolls in. */
const PAGE = 30

function LibraryPage() {
    // Hooks before ANY early return (Rules of Hooks — the #310 lesson).
    const navigate = useNavigate()
    const { firebaseUser } = useAuth()
    const online = useOnline()
    const [search, setSearch] = useState('')
    const [language, setLanguage] = useState<ContentLanguage>('all')
    const [visibleCount, setVisibleCount] = useState(PAGE)
    const sentinelRef = useRef<HTMLDivElement | null>(null)

    const { results, recentSection, searching, backendPending, ownPending } =
        useLibraryResults(search, language)
    const download = useDownloadSong()
    const removeDownload = useRemoveDownload()
    const fork = useCloneSong()

    // Infinite scroll over the working set (browse) / results (search).
    useEffect(() => {
        const el = sentinelRef.current
        if (!el) return
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                setVisibleCount((n) => n + PAGE)
            }
        })
        io.observe(el)
        return () => io.disconnect()
    }, [])
    useEffect(() => setVisibleCount(PAGE), [search, language])

    const myUid = firebaseUser?.uid
    const visible = results.slice(0, visibleCount)
    const exhausted = visibleCount >= results.length

    const cardActions = (item: TieredSong) => ({
        onPlay: () => void navigate({ to: '/session', search: { guest: false, songId: item.song.id } }),
        onAdd: () => download.mutate(item.song),
        onRemove: () => removeDownload.mutate(item.song.id),
        onFork: () => fork.mutate(item.song.id),
    })

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <Link
                    to="/dashboard"
                    style={{
                        color: 'var(--text-secondary)',
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
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Library</h1>

                    <div
                        style={{
                            display: 'flex',
                            gap: '1rem',
                            flex: 1,
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            minWidth: '300px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <LanguageFilter value={language} onChange={setLanguage} />
                        <input
                            type="text"
                            placeholder="Search your library, community and official songs…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                padding: '0.75rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                maxWidth: '320px',
                                width: '100%',
                            }}
                        />
                        <Link
                            to="/library/new"
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: 'var(--primary)',
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

            {!online && (
                <div
                    data-testid="offline-banner"
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
                    📴 Offline — showing your local library (downloads, recents and your own
                    songs). Community search needs a connection.
                </div>
            )}

            {/* RECENT (~5, last-opened) — a display queue, distinct from the
                offline cache and from My Songs (DEC-150). */}
            {!searching && recentSection.length > 0 && (
                <Section title="Recent" testId="recent-section">
                    <CardGrid
                        items={recentSection}
                        myUid={myUid}
                        search=""
                        actions={cardActions}
                        busy={download.isPending || removeDownload.isPending}
                    />
                </Section>
            )}

            <Section title={searching ? 'Results' : 'My songs'} testId="main-section">
                {ownPending && visible.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', padding: '2rem 0' }}>Loading library...</p>
                ) : visible.length === 0 ? (
                    <EmptyState searching={searching} search={search} onClear={() => setSearch('')} />
                ) : (
                    <CardGrid
                        items={visible}
                        myUid={myUid}
                        search={search}
                        actions={cardActions}
                        busy={download.isPending || removeDownload.isPending}
                    />
                )}
                {backendPending && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.75rem 0' }}>
                        Searching community &amp; official libraries…
                    </p>
                )}
                <div ref={sentinelRef} />
                {/* The honest end state: browse never drifts into community —
                    search is the on-ramp outward (DEC-145). */}
                {!searching && exhausted && visible.length > 0 && (
                    <p
                        data-testid="browse-end"
                        style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '1.25rem 0', textAlign: 'center' }}
                    >
                        That&apos;s all your songs. Search above to reach the community and official libraries.
                    </p>
                )}
            </Section>
        </div>
    )
}

function Section({ title, testId, children }: { title: string; testId: string; children: React.ReactNode }) {
    return (
        <section data-testid={testId} style={{ marginBottom: '1.5rem' }}>
            <h2
                style={{
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    margin: '0.5rem 0 0.75rem',
                }}
            >
                {title}
            </h2>
            {children}
        </section>
    )
}

function EmptyState({ searching, search, onClear }: { searching: boolean; search: string; onClear: () => void }) {
    return (
        <div
            style={{
                textAlign: 'center',
                padding: '4rem',
                background: 'var(--bg-tertiary)',
                borderRadius: '8px',
            }}
        >
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {searching ? `No songs match “${search}”.` : 'No songs yet.'}
            </p>
            {searching ? (
                <button
                    onClick={onClear}
                    style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                    Clear search
                </button>
            ) : (
                <Link to="/library/new" style={{ color: 'var(--primary)' }}>
                    Create your first song
                </Link>
            )}
        </div>
    )
}

function CardGrid({
    items,
    myUid,
    search,
    actions,
    busy,
}: {
    items: TieredSong[]
    myUid: string | undefined
    search: string
    actions: (item: TieredSong) => { onPlay: () => void; onAdd: () => void; onRemove: () => void; onFork: () => void }
    busy: boolean
}) {
    return (
        <div
            style={{
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            }}
        >
            {items.map((item) => (
                <SongCard key={`${item.tier}:${item.song.id}`} item={item} myUid={myUid} search={search} busy={busy} {...actions(item)} />
            ))}
        </div>
    )
}

function SongCard({
    item,
    myUid,
    search,
    busy,
    onPlay,
    onAdd,
    onRemove,
    onFork,
}: {
    item: TieredSong
    myUid: string | undefined
    search: string
    busy: boolean
    onPlay: () => void
    onAdd: () => void
    onRemove: () => void
    onFork: () => void
}) {
    const { song, offline } = item
    const [menuOpen, setMenuOpen] = useState(false)
    const isOwn = myUid !== undefined && song.ownerId === myUid
    const stop = (e: React.MouseEvent, fn: () => void) => {
        // The card is a Link — actions must not navigate.
        e.preventDefault()
        e.stopPropagation()
        fn()
    }

    return (
        <Link
            to="/library/$id"
            params={{ id: song.id }}
            style={{
                background: 'var(--bg-secondary)',
                padding: '1.5rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                textDecoration: 'none',
                color: 'inherit',
                position: 'relative',
            }}
        >
            <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
                    {song.title}
                    <SourceBadge song={song} myUid={myUid} />
                    {offline && (
                        <span
                            title="Available offline"
                            data-testid={`offline-${song.id}`}
                            style={{ marginLeft: '0.4rem', fontSize: '0.75rem', verticalAlign: 'middle' }}
                        >
                            📴✓
                        </span>
                    )}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {song.author || 'Unknown Author'}
                </p>
            </div>

            <div
                style={{
                    background: 'var(--bg-tertiary)',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
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
                    color: 'var(--text-muted)',
                }}
            >
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ background: 'var(--bg-tertiary)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        {song.defaultKey}
                    </span>
                    <button
                        title="Start a session with this song"
                        onClick={(e) => stop(e, onPlay)}
                        style={{
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '0.2rem 0.6rem',
                            cursor: 'pointer',
                        }}
                    >
                        ▶
                    </button>

                    {/* WP-171 (DEC-146): 'Add to my library' is the PRIMARY
                        action on someone else's song; fork hides in ⋯. */}
                    {!isOwn && !offline && (
                        <button
                            data-testid={`download-${song.id}`}
                            disabled={busy}
                            title="Adds this song to your library and keeps it available offline"
                            onClick={(e) => stop(e, onAdd)}
                            style={{
                                background: 'var(--bg-tertiary)',
                                color: 'var(--primary)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '0.2rem 0.6rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            💾 Add to my library
                        </button>
                    )}
                    {!isOwn && offline && (
                        <button
                            data-testid={`download-${song.id}`}
                            disabled={busy}
                            aria-pressed
                            title="In your library (offline) — click to remove"
                            onClick={(e) => stop(e, onRemove)}
                            style={{
                                background: 'none',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '0.2rem 0.6rem',
                                cursor: 'pointer',
                            }}
                        >
                            ✓ In my library
                        </button>
                    )}
                    {!isOwn && (
                        <span style={{ position: 'relative' }}>
                            <button
                                aria-label="More options"
                                data-testid={`more-${song.id}`}
                                onClick={(e) => stop(e, () => setMenuOpen((v) => !v))}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    padding: '0.2rem 0.4rem',
                                }}
                            >
                                ⋯
                            </button>
                            {menuOpen && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        zIndex: 20,
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <button
                                        data-testid={`fork-${song.id}`}
                                        title="Make an editable copy you own (a separate song)"
                                        onClick={(e) => stop(e, () => { setMenuOpen(false); onFork() })}
                                        style={{
                                            display: 'block',
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--text-primary)',
                                            cursor: 'pointer',
                                            padding: '0.5rem 0.9rem',
                                            fontSize: '0.85rem',
                                        }}
                                    >
                                        ⑂ Fork (my own copy)
                                    </button>
                                </span>
                            )}
                        </span>
                    )}
                </div>
                <span>{new Date(song.createdAt).toLocaleDateString()}</span>
            </div>
        </Link>
    )
}

/** Where a song comes from: nothing for my own, a chip for shared sources. */
function SourceBadge({ song, myUid }: { song: Song; myUid: string | undefined }) {
    const label =
        song.libraryType === 'official'
            ? 'Official'
            : song.visibility === 'public' && song.ownerId !== myUid
              ? 'Community'
              : null
    if (label === null) return null
    return (
        <span
            style={{
                marginLeft: '0.5rem',
                verticalAlign: 'middle',
                fontSize: '0.65rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '0.15rem 0.45rem',
                borderRadius: '999px',
                background: label === 'Official' ? 'var(--primary)' : 'var(--bg-tertiary)',
                color: label === 'Official' ? 'white' : 'var(--text-secondary)',
                border: label === 'Official' ? 'none' : '1px solid var(--border)',
            }}
        >
            {label}
        </span>
    )
}

function getLyricsSnippet(song: Song, searchTerm: string) {
    if (!song.parts) return null

    // Flatten all lines — snippets are for READING, so chord tokens go.
    const allLines: string[] = []
    song.parts.forEach((p: SongPart) => {
        p.lines.forEach((l) => {
            allLines.push(l.text.replace(/\[[^\]]*\]/g, ''))
        })
    })

    if (allLines.length === 0) return 'No lyrics available'

    let startIndex = 0
    if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const foundIndex = allLines.findIndex((line) => line.toLowerCase().includes(term))
        if (foundIndex !== -1) startIndex = foundIndex
    }

    const snippetLines = allLines.slice(startIndex, startIndex + 3)

    return (
        <>
            {snippetLines.map((line, i) => (
                <div
                    key={i}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    <HighlightedText text={line} highlight={searchTerm} />
                </div>
            ))}
            {startIndex + 3 < allLines.length && <span>...</span>}
        </>
    )
}

function HighlightedText({ text, highlight }: { text: string; highlight: string }) {
    if (!highlight.trim()) return <>{text}</>

    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === highlight.toLowerCase() ? (
                    <span key={i} style={{ backgroundColor: '#fff0b3', color: '#1a1a1a', fontWeight: 'bold' }}>
                        {part}
                    </span>
                ) : (
                    part
                ),
            )}
        </span>
    )
}
