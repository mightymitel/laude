import { formatChord, Key, ChordStyle, extractChordsFromLine } from '@laudasist/shared';
import styles from './SongLine.module.css';
import { useSongLineSegments } from '@/hooks/useSongLineSegments';
import { SongSegment } from './SongSegment';

export interface SongLineProps {
    text: string;
    displayKey: Key;
    chordStyle: ChordStyle;
    chordPosition: 'above' | 'inline' | 'compact';
    showChords?: boolean;
    className?: string;
}

export function SongLine({
    text,
    displayKey,
    chordStyle,
    chordPosition,
    showChords = true,
    className = '',
}: SongLineProps) {
    // Legacy support for Compact/Inline which don't use segments yet
    // But we should use the hook for consistency if possible?
    // Compact/Inline logic is different. Let's keep them separate for now or refactor later.
    // The user specifically cared about "Above" mode matching editor.

    // Quick Extract for non-above modes
    const { text: cleanText, chords } = extractChordsFromLine(text);

    if (!showChords || chords.length === 0) {
        return <div className={`${styles.line} ${className}`}>{cleanText}</div>;
    }

    // COMPACT MODE: chords before lyrics
    if (chordPosition === 'compact') {
        const formattedChords = chords.map((c) =>
            formatChord(c.chord, displayKey, chordStyle)
        );

        const firstChordIndex = chords[0]?.index ?? 0;
        const needsLowdash = firstChordIndex > 10;
        const chordPrefix = needsLowdash ? '_ ' : '';
        const chordString = formattedChords.join(' ');

        return (
            <div className={`${styles.lineCompact} ${className}`}>
                <span className={styles.chordsStart}>
                    {chordPrefix}{chordString}
                </span>
                <span>{cleanText}</span>
            </div>
        );
    }

    // INLINE MODE: chords in brackets [C]
    if (chordPosition === 'inline') {
        const segments: React.ReactNode[] = [];
        let lastIndex = 0;
        const formattedChords = chords.map((c) => ({
            ...c,
            display: formatChord(c.chord, displayKey, chordStyle)
        })).sort((a, b) => a.index - b.index);

        formattedChords.forEach((chord, i) => {
            if (chord.index > lastIndex) {
                segments.push(
                    <span key={`t${i}`}>
                        {cleanText.substring(lastIndex, chord.index)}
                    </span>
                );
            }
            segments.push(
                <span key={`c${i}`} className={styles.chordInline}>
                    [{chord.display}]
                </span>
            );
            lastIndex = chord.index;
        });

        if (lastIndex < cleanText.length) {
            segments.push(<span key="end">{cleanText.substring(lastIndex)}</span>);
        }

        return <div className={`${styles.line} ${className}`}>{segments}</div>;
    }

    // ABOVE MODE (Default): Use shared segment logic
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { segments } = useSongLineSegments(text, displayKey, chordStyle);

    return (
        <div className={`${styles.lineAbove} ${className}`}>
            {segments.map((seg, i) => (
                <SongSegment key={i} segment={seg} />
            ))}
        </div>
    );
}
