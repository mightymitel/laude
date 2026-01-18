import { useState } from 'react';
import { usePlaylists, type Playlist } from '@/hooks/usePlaylists';
import { useSong } from '@/hooks/useSongs';
import type { Key } from '@laudasist/shared';
import styles from './PlaylistPanel.module.css';

const POSSIBLE_KEYS: Key[] = [
    'C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F',
];

interface SessionPlaylistItem {
    id: string;
    songId: string;
    key?: Key;
    arrangement?: string;
    isExternal?: boolean;
}

interface PlaylistPanelProps {
    sessionPlaylist: SessionPlaylistItem[];
    onAddSong: (item: SessionPlaylistItem) => void;
    onRemoveSong: (itemId: string) => void;
    onUpdateItem: (itemId: string, updates: Partial<SessionPlaylistItem>) => void;
    onSelectSong: (songId: string, key?: Key) => void;
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
    onUpdateKey: (key: Key) => void;
    isActive: boolean;
}) {
    const { data: song } = useSong(item.songId);

    return (
        <div
            className={`${styles.playlistItem} ${isActive ? styles.playlistItemActive : ''}`}
            onClick={onSelect}
        >
            <div className={styles.itemInfo}>
                <span className={styles.itemTitle}>
                    {song?.title || 'Loading...'}
                </span>
                {item.isExternal && <span className={styles.externalBadge}>🔗</span>}
            </div>
            <div className={styles.itemActions}>
                <select
                    className={styles.keySelect}
                    value={item.key || song?.originalKey || 'C'}
                    onChange={(e) => {
                        e.stopPropagation();
                        onUpdateKey(e.target.value as Key);
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
        playlist.items.forEach((item) => {
            onAddSong({
                id: `${Date.now()}-${item.songId}`,
                songId: item.songId,
                key: item.key,
                arrangement: item.arrangement,
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

export type { SessionPlaylistItem };
