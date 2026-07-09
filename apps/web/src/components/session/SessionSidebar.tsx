import type { Song } from '@laudasist/shared'
import { PlaylistPanel, type SessionPlaylistItem } from '@/components/PlaylistPanel'
import styles from '../../routes/session.module.css'

interface SessionSidebarProps {
    collapsed: boolean
    onToggleCollapsed: () => void
    searchQuery: string
    onSearchChange: (value: string) => void
    songs: Song[] | null | undefined
    currentSongId: string | null
    onPickSong: (song: Song) => void
    onAddToPlaylist: (song: Song) => void
    sessionPlaylist: SessionPlaylistItem[]
    onPlaylistAdd: (item: SessionPlaylistItem) => void
    onPlaylistRemove: (itemId: string) => void
    onPlaylistUpdate: (itemId: string, updates: Partial<SessionPlaylistItem>) => void
    onPlaylistSelect: (songId: string, key?: string) => void
}

/** Search + results + the session playlist (left panel of the session page). */
export function SessionSidebar(props: SessionSidebarProps) {
    const { collapsed, searchQuery, songs } = props

    return (
        <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
            <button
                className={styles.sidebarToggle}
                onClick={props.onToggleCollapsed}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {collapsed ? '→' : '←'}
            </button>
            {!collapsed && (
                <>
                    <div className={styles.searchBox}>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => props.onSearchChange(e.target.value)}
                            placeholder="🔍 Search songs..."
                            className={styles.searchInput}
                            autoFocus
                        />
                    </div>

                    <div className={styles.resultsList}>
                        {songs?.map((song) => (
                            <div
                                key={song.id}
                                className={`${styles.resultItem} ${song.id === props.currentSongId ? styles.resultItemActive : ''}`}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData(
                                        'application/json',
                                        JSON.stringify({
                                            songId: song.id,
                                            key: song.defaultKey,
                                            // Include song data for presenter access
                                            song: {
                                                id: song.id,
                                                title: song.title,
                                                author: song.author,
                                                defaultKey: song.defaultKey,
                                                parts: song.parts,
                                            },
                                        }),
                                    )
                                    e.dataTransfer.effectAllowed = 'copy'
                                }}
                            >
                                <button className={styles.resultContent} onClick={() => props.onPickSong(song)}>
                                    <span className={styles.resultTitle}>{song.title}</span>
                                    <span className={styles.resultKey}>{song.defaultKey}</span>
                                </button>
                                <div className={styles.resultMenu}>
                                    <button
                                        className={styles.menuBtn}
                                        onClick={(e) => e.stopPropagation()}
                                        title="Song options"
                                    >
                                        ⋮
                                    </button>
                                    <div className={styles.menuDropdown}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                props.onAddToPlaylist(song)
                                            }}
                                        >
                                            ➕ Add to Playlist
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {searchQuery && songs?.length === 0 && (
                            <div className={styles.noResults}>No songs found</div>
                        )}
                        {!songs?.length && !searchQuery && (
                            <div className={styles.hint}>No songs in library</div>
                        )}
                    </div>

                    <PlaylistPanel
                        sessionPlaylist={props.sessionPlaylist}
                        currentSongId={props.currentSongId}
                        onAddSong={props.onPlaylistAdd}
                        onRemoveSong={props.onPlaylistRemove}
                        onUpdateItem={props.onPlaylistUpdate}
                        onSelectSong={props.onPlaylistSelect}
                    />
                </>
            )}
        </aside>
    )
}
