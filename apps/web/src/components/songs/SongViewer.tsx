import { useState } from 'react';
import { Song, Key, ChordStyle, SongPart } from '@laudasist/shared';
// Import unified line component
import { SongLine } from './SongLine';
import { officialArrangementOf, sequenceOf } from '@/rendering/core';

import styles from './SongViewer.module.css';

/** Per-device (DEC-120): the compact ⇄ arrangement toggle never touches
 * session state. Viewports always render arrangement view — compact cannot
 * disambiguate repeats (DEC-147); this toggle exists on the SONG VIEW only. */
const VIEW_PREF_KEY = 'laudasist.songView.view';

function loadViewPref(): 'compact' | 'arrangement' {
    return localStorage.getItem(VIEW_PREF_KEY) === 'arrangement' ? 'arrangement' : 'compact';
}

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
    const [view, setView] = useState<'compact' | 'arrangement'>(loadViewPref);
    const [showChords, setShowChords] = useState(true);
    const isFavoriteKey = favoriteKey != null && favoriteKey === transposeKey;

    // Render-by-part (DEC-147): parts are canonical; the sequence is ordered
    // refs — in arrangement view a repeated part renders again per occurrence.
    const arrangement = officialArrangementOf(song);
    const sequence = sequenceOf(song.parts, view, arrangement);
    const hasRepeats = arrangement !== undefined && arrangement.length > song.parts.length - 1;

    const setViewPref = (v: 'compact' | 'arrangement') => {
        setView(v);
        localStorage.setItem(VIEW_PREF_KEY, v);
    };

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

                    <div className={styles.controlGroup}>
                        <label>CHORDS</label>
                        <button
                            className={styles.select}
                            aria-pressed={showChords}
                            data-testid="toggle-chords"
                            onClick={() => setShowChords((v) => !v)}
                            title={showChords ? 'Hide chords (lyrics only)' : 'Show chords'}
                        >
                            {showChords ? 'On' : 'Off'}
                        </button>
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
                    {/* Compact ⇄ arrangement view (WP-168) — only offered when
                        the song has an official arrangement to expand. */}
                    {arrangement !== undefined && (
                        <div className={styles.controlGroup}>
                            <label>VIEW</label>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button
                                    className={styles.select}
                                    aria-pressed={view === 'compact'}
                                    data-testid="view-compact"
                                    style={view === 'compact' ? { outline: '2px solid var(--primary)' } : {}}
                                    onClick={() => setViewPref('compact')}
                                    title="Each part once — lead-sheet shape"
                                >
                                    Compact
                                </button>
                                <button
                                    className={styles.select}
                                    aria-pressed={view === 'arrangement'}
                                    data-testid="view-arrangement"
                                    style={view === 'arrangement' ? { outline: '2px solid var(--primary)' } : {}}
                                    onClick={() => setViewPref('arrangement')}
                                    title="Parts repeated in performance order"
                                >
                                    Arrangement
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Song Content — parts rendered once, reused per occurrence. */}
            <div className={styles.content}>
                {sequence.map((occ, i) => {
                    const part = song.parts[occ.part]!;
                    return (
                        <SongPartDisplay
                            key={`${part.id || occ.part}:${occ.occurrence}:${i}`}
                            part={part}
                            occurrence={view === 'arrangement' && hasRepeats ? occ.occurrence : 0}
                            currentKey={transposeKey}
                            style={chordStyle}
                            position={chordPosition}
                            showChords={showChords}
                        />
                    );
                })}
            </div>
        </div>
    );
}

function SongPartDisplay({
    part,
    occurrence,
    currentKey,
    style,
    position,
    showChords
}: {
    part: SongPart;
    /** >0 = which repeat of this part in the arrangement view. */
    occurrence: number;
    currentKey: Key;
    style: ChordStyle;
    position: 'above' | 'inline' | 'compact';
    showChords: boolean;
}) {
    return (
        <div className={styles.part}>
            <h3 className={styles.partHeader}>
                {part.type} {part.index > 0 ? part.index : ''}
                {occurrence > 1 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · repeat {occurrence}</span>}
            </h3>

            <div className={styles.linesContainer}>
                {part.lines.map((line, j) => (
                    <SongLine
                        key={j}
                        text={line.text}
                        displayKey={currentKey}
                        chordStyle={style}
                        chordPosition={position}
                        showChords={showChords}
                    />
                ))}
            </div>
        </div>
    );
}
