import { useState } from 'react';
import { usePlaylists, type Playlist } from '@/hooks/usePlaylists';
import { useSong } from '@/hooks/useSongs';
import { POSSIBLE_KEYS } from '@/lib/keys';
import type { EmbeddedSong, SessionPlaylistItem } from '@laude/session';
import { PlaylistPortability } from './session/PlaylistPortability';
import styles from './PlaylistPanel.module.css';

// Session content types now live in @laude/session (by-value path).
export type { EmbeddedSong, SessionPlaylistItem };

interface PlaylistPanelProps {
    sessionPlaylist: SessionPlaylistItem[];
    onAddSong: (item: SessionPlaylistItem) => void;
    onRemoveSong: (itemId: string) => void;
    onUpdateItem: (itemId: string, updates: Partial<SessionPlaylistItem>) => void;
    onSelectSong: (songId: string, key?: string) => void;
    currentSongId: string | null;
}

// Component to display a single playlist item with song title
function PlaylistItemRow({
    item,
    onSelect,
    onRemove,
    onUpdateKey,
    isActive,
}: {
    item: SessionPlaylistItem;
    onSelect: () => void;
    onRemove: () => void;
    onUpdateKey: (key: string) => void;
    isActive: boolean;
}) {
    // Use embedded song data if available, otherwise fetch
    const { data: fetchedSong } = useSong(item.song ? '' : item.songId);
    const song = item.song || fetchedSong;

    return (
        <div
            className={`${styles.playlistItem} ${isActive ? styles.playlistItemActive : ''} ${item.temporary ? styles.playlistItemTemporary : ''}`}
            onClick={onSelect}
        >
            <div className={styles.itemInfo}>
                <span className={styles.itemTitle}>
                    {song?.title || 'Loading...'}
                    {item.temporary && <span className={styles.tempBadge}>•</span>}
                </span>
            </div>
            <div className={styles.itemActions}>
                <select
                    className={styles.keySelect}
                    value={item.key || song?.originalKey || 'C'}
                    onChange={(e) => {
                        e.stopPropagation();
                        onUpdateKey(e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    title="Change key"
                >
                    {POSSIBLE_KEYS.map((k) => (
                        <option key={k} value={k}>{k}</option>
                    ))}
                </select>
                <button
                    className={styles.removeBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    title="Remove from playlist"
                >
                    ×
                </button>
            </div>
        </div>
    );
}

export function PlaylistPanel({
    sessionPlaylist,
    onAddSong,
    onRemoveSong,
    onUpdateItem,
    onSelectSong,
    currentSongId,
}: PlaylistPanelProps) {
    const [showLoadModal, setShowLoadModal] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const { data: userPlaylists } = usePlaylists();

    const handleLoadPlaylist = (playlist: Playlist) => {
        // Clone-in (DEC-38): the session gets a COPY; by-value songs (new
        // envelope) hydrate directly, legacy by-ref items load from the library.
        playlist.items.forEach((item) => {
            onAddSong({
                id: `${Date.now()}-${item.songId}`,
                songId: item.songId,
                key: item.key,
                arrangement: item.arrangement,
                song: item.song,
            });
        });
        setShowLoadModal(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.songId) {
                onAddSong({
                    id: `${Date.now()}-${data.songId}`,
                    songId: data.songId,
                    key: data.key,
                    // Include embedded song data if available
                    song: data.song,
                });
            }
        } catch {
            // Invalid data, ignore
        }
    };

    return (
        <div
            className={`${styles.panel} ${isDragging ? styles.panelDragging : ''}`}
            onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
        >
            <div className={styles.header}>
                <h3>📋 Session Playlist</h3>
                <button
                    className={styles.loadBtn}
                    onClick={() => setShowLoadModal(true)}
                >
                    + Load
                </button>
            </div>

            <PlaylistPortability
                items={sessionPlaylist}
                onImport={(imported) => imported.forEach((item) => onAddSong(item))}
            />

            {sessionPlaylist.length === 0 ? (
                <div className={styles.empty}>
                    No songs in playlist. Search and add songs, or load a saved playlist.
                </div>
            ) : (
                <div className={styles.list}>
                    {sessionPlaylist.map((item) => (
                        <PlaylistItemRow
                            key={item.id}
                            item={item}
                            isActive={item.songId === currentSongId}
                            onSelect={() => onSelectSong(item.songId, item.key)}
                            onRemove={() => onRemoveSong(item.id)}
                            onUpdateKey={(key) => onUpdateItem(item.id, { key })}
                        />
                    ))}
                </div>
            )}

            {/* Load Playlist Modal */}
            {showLoadModal && (
                <div className={styles.modalOverlay} onClick={() => setShowLoadModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <h3>Load Playlist</h3>
                        {userPlaylists && userPlaylists.length > 0 ? (
                            <div className={styles.playlistList}>
                                {userPlaylists.map((playlist) => (
                                    <button
                                        key={playlist.id}
                                        className={styles.playlistOption}
                                        onClick={() => handleLoadPlaylist(playlist)}
                                    >
                                        <span>{playlist.name}</span>
                                        <span className={styles.itemCount}>
                                            {playlist.items.length} songs
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className={styles.noPlaylists}>No saved playlists yet.</p>
                        )}
                        <button
                            className={styles.closeBtn}
                            onClick={() => setShowLoadModal(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
