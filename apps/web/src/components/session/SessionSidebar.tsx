import type { Song } from '@laudasist/shared'
import type { DjManifestEntry } from '@laude/session'
import { useState } from 'react'
import { LanguageFilter } from '@/components/LanguageFilter'
import type { ContentLanguage } from '@/hooks/useLibraryResults'
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
    /** Library songs the connected DJ can back with audio (Flow 5). */
    djAudioSongIds: Set<string>
    /** The DJ's local-only songs — requestable, transmitted by-value. */
    djLocalSongs: DjManifestEntry[]
    onRequestDjSong: (localSongId: string) => void
    /** Set when the page was opened from a persisted session (DEC-96). */
    savedSessionId?: string
    savedSessionName?: string
}

/** Search + results + the session playlist (left panel of the session page;
 * off-canvas drawer with a backdrop on phones). */
export function SessionSidebar(props: SessionSidebarProps) {
    const { collapsed, searchQuery, songs } = props
    // Content-language filter (WP-172/DEC-151): same component as the
    // library; defaults to ALL; fails open on unlabelled songs.
    const [language, setLanguage] = useState<ContentLanguage>('all')
    const visibleSongs = songs?.filter(
        (song) => language === 'all' || song.language === undefined || song.language === language,
    )

    return (
        <>
            {!collapsed && (
                <button
                    className={styles.sidebarBackdrop}
                    aria-label="Close song panel"
                    onClick={props.onToggleCollapsed}
                />
            )}
            {collapsed && (
                <button
                    className={styles.drawerOpener}
                    onClick={props.onToggleCollapsed}
                    data-testid="open-song-panel"
                >
                    🎵 Songs
                </button>
            )}
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
                        <div style={{ padding: '0.4rem 0' }}>
                            <LanguageFilter value={language} onChange={setLanguage} compact />
                        </div>
                        {visibleSongs?.map((song) => (
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
                                    <span className={styles.resultTitle}>
                                        {song.title}
                                        {props.djAudioSongIds.has(song.id) && (
                                            <span title="The DJ can back this song with audio"> 🎛</span>
                                        )}
                                    </span>
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
                        {props.djLocalSongs.length > 0 && (
                            <>
                                <div className={styles.hint}>From the DJ (by-value)</div>
                                {props.djLocalSongs.map((entry) => (
                                    <div key={entry.local_song_id} className={styles.resultItem} data-testid="dj-local-song">
                                        <button
                                            className={styles.resultContent}
                                            onClick={() => props.onRequestDjSong(entry.local_song_id)}
                                            title="Ask the DJ to transmit this song (display + audio from the DJ)"
                                        >
                                            <span className={styles.resultTitle}>🎛 {entry.title}</span>
                                            <span className={styles.resultKey}>{entry.key}</span>
                                        </button>
                                    </div>
                                ))}
                            </>
                        )}
                        {searchQuery && songs?.length === 0 && props.djLocalSongs.length === 0 && (
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
                        savedSessionId={props.savedSessionId}
                        savedSessionName={props.savedSessionName}
                    />
                </>
            )}
        </aside>
        </>
    )
}
