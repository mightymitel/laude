import { useState } from 'react';
import { Song, Key, ChordStyle, SongPart } from '@laudasist/shared';
// Import unified line component
import { SongLine } from './SongLine';

import styles from './SongViewer.module.css';

const KEYS: Key[] = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

interface SongViewerProps {
    song: Song;
}

export function SongViewer({ song }: SongViewerProps) {
    const [transposeKey, setTransposeKey] = useState<Key>(song.originalKey);
    const [chordStyle, setChordStyle] = useState<ChordStyle>('letters');
    const [chordPosition, setChordPosition] = useState<'above' | 'inline' | 'compact'>('above');

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
                        <select
                            value={transposeKey}
                            onChange={(e) => setTransposeKey(e.target.value as Key)}
                            className={styles.select}
                        >
                            {KEYS.map(k => (
                                <option key={k} value={k}>{k}</option>
                            ))}
                        </select>
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
