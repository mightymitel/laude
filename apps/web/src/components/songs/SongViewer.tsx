
import { useState } from 'react';
import { Song, Key, ChordStyle, SongPart } from '@laudasist/shared';
// We need to import these from the package, assuming they are exported
import { extractChordsFromLine, formatChord } from '@laudasist/shared';

import styles from './SongViewer.module.css';

const KEYS: Key[] = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

interface SongViewerProps {
    song: Song;
}

export function SongViewer({ song }: SongViewerProps) {
    const [transposeKey, setTransposeKey] = useState<Key>(song.originalKey);
    const [chordStyle, setChordStyle] = useState<ChordStyle>('letters');

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
                    />
                ))}
            </div>
        </div>
    );
}

function SongPartDisplay({ part, currentKey, style }: { part: SongPart; currentKey: Key; style: ChordStyle }) {
    return (
        <div className={styles.part}>
            <h3 className={styles.partHeader}>
                {part.type} {part.index > 0 ? part.index : ''}
            </h3>

            <div className={styles.linesContainer}>
                {part.lines.map((line, j) => (
                    <SongLineDisplay
                        key={j}
                        line={line.text}
                        currentKey={currentKey}
                        style={style}
                    />
                ))}
            </div>
        </div>
    );
}

function SongLineDisplay({ line, currentKey, style }: { line: string; currentKey: Key; style: ChordStyle }) {
    // 1. Extract chords from the line (which are in Nashville format [1], [5] etc)
    const { text, chords } = extractChordsFromLine(line);

    if (chords.length === 0) {
        return <div className={styles.textSegment}>{line}</div>;
    }

    // 2. We need to render LYRICS + CHORDS.
    // Let's use a Flex/Span approach where we chop the line into segments.

    // Sort chords ascending
    const sortedChords = [...chords].sort((a, b) => a.index - b.index);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segments: { type: 'text' | 'chord'; content: string }[] = [];
    let lastIndex = 0;

    sortedChords.forEach((chordPos, k) => {
        // Text before this chord
        const preText = text.substring(lastIndex, chordPos.index);
        if (preText) {
            segments.push({ type: 'text', content: preText });
        }

        // The Chord itself
        // Format it:
        const displayChord = formatChord(chordPos.chord, currentKey, style);

        segments.push({ type: 'chord', content: displayChord });

        lastIndex = chordPos.index;
    });

    // Remaining text
    if (lastIndex < text.length) {
        segments.push({ type: 'text', content: text.substring(lastIndex) });
    }

    return (
        <div className={styles.lineWrapper}>
            {segments.map((seg, k) => {
                if (seg.type === 'text') {
                    // Replace spaces with non-breaking spaces to preserve layout?
                    // Or pre-wrap.
                    return <span key={k} className={styles.textSegment}>{seg.content}</span>;
                } else {
                    return (
                        <div key={k} className={styles.chordSegment}>
                            <span className={styles.chordSymbol}>
                                {seg.content}
                            </span>
                        </div>
                    );
                }
            })}
        </div>
    );
}
