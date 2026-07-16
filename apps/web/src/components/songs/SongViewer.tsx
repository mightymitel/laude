import { useState } from 'react';
import { Song, Key, ChordStyle, SongPart } from '@laudasist/shared';
// Import unified line component
import { SongLine } from './SongLine';

import styles from './SongViewer.module.css';

const KEYS: Key[] = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

interface SongViewerProps {
    song: Song;
    /** Seeds the transpose select (WP-162: the user's favoriteKey, else defaultKey). */
    initialKey?: Key;
    /** The stored favorite key, when signed in — drives the ★ affordance. */
    favoriteKey?: Key | null;
    /** Set (current key) / clear (null) the favorite. Omitted = affordance hidden. */
    onFavoriteKeyChange?: (key: Key | null) => void;
}

export function SongViewer({ song, initialKey, favoriteKey, onFavoriteKeyChange }: SongViewerProps) {
    const [transposeKey, setTransposeKey] = useState<Key>(initialKey ?? song.defaultKey);
    const [chordStyle, setChordStyle] = useState<ChordStyle>('letters');
    const [chordPosition, setChordPosition] = useState<'above' | 'inline' | 'compact'>('above');
    const isFavoriteKey = favoriteKey != null && favoriteKey === transposeKey;

    return (
        <div className={styles.container}>
            {/* Header / Controls */}
            <div className={styles.header}>
                <div className={styles.titleGroup}>
                    <h1>{song.title}</h1>
                    <p>{song.author}</p>
                </div>

                <div className={styles.controls}>
                    {/* Key Selector */}
                    <div className={styles.controlGroup}>
                        <label>TRANSPOSE</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <select
                                value={transposeKey}
                                onChange={(e) => setTransposeKey(e.target.value as Key)}
                                className={styles.select}
                            >
                                {KEYS.map(k => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                            {onFavoriteKeyChange && (
                                <button
                                    data-testid="favorite-key-toggle"
                                    title={
                                        isFavoriteKey
                                            ? `Favorite key (${transposeKey}) — click to clear`
                                            : `Set ${transposeKey} as your favorite key for this song`
                                    }
                                    aria-pressed={isFavoriteKey}
                                    onClick={() => onFavoriteKeyChange(isFavoriteKey ? null : transposeKey)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '1.2rem',
                                        lineHeight: 1,
                                        color: isFavoriteKey ? '#f59e0b' : 'var(--text-muted)',
                                        padding: '0.2rem',
                                    }}
                                >
                                    {isFavoriteKey ? '★' : '☆'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Style Selector */}
                    <div className={styles.controlGroup}>
                        <label>NOTATION</label>
                        <select
                            value={chordStyle}
                            onChange={(e) => setChordStyle(e.target.value as ChordStyle)}
                            className={styles.select}
                        >
                            <option value="letters">Letters (C, G)</option>
                            <option value="nashville">Nashville (1, 5)</option>
                            <option value="roman">Roman (I, V)</option>
                        </select>
                    </div>

                    {/* Position Selector */}
                    <div className={styles.controlGroup}>
                        <label>POSITION</label>
                        <select
                            value={chordPosition}
                            onChange={(e) => setChordPosition(e.target.value as 'above' | 'inline' | 'compact')}
                            className={styles.select}
                        >
                            <option value="above">Above</option>
                            <option value="inline">Inline</option>
                            <option value="compact">Compact</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Song Content */}
            <div className={styles.content}>
                {song.parts.map((part, i) => (
                    <SongPartDisplay
                        key={part.id || i}
                        part={part}
                        currentKey={transposeKey}
                        style={chordStyle}
                        position={chordPosition}
                    />
                ))}
            </div>
        </div>
    );
}

function SongPartDisplay({
    part,
    currentKey,
    style,
    position
}: {
    part: SongPart;
    currentKey: Key;
    style: ChordStyle;
    position: 'above' | 'inline' | 'compact';
}) {
    return (
        <div className={styles.part}>
            <h3 className={styles.partHeader}>
                {part.type} {part.index > 0 ? part.index : ''}
            </h3>

            <div className={styles.linesContainer}>
                {part.lines.map((line, j) => (
                    <SongLine
                        key={j}
                        text={line.text}
                        displayKey={currentKey}
                        chordStyle={style}
                        chordPosition={position}
                    />
                ))}
            </div>
        </div>
    );
}
