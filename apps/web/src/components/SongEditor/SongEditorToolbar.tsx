import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Key, ChordStyle, formatChord, parseNashville } from '@laudasist/shared';
import { ChordAlterationMenu } from './ChordAlterationMenu';
import { DraggedChord } from './types';
import styles from './SongEditor.module.css';

interface SongEditorToolbarProps {
    currentKey: Key;
    chordStyle: ChordStyle;
    lyricsLocked: boolean;
    onLockToggle: () => void;
    onChordClick?: (chord: string) => void;  // Click/tap to insert at cursor
    customChords?: string[];
    songChords?: string[];  // Chords extracted from current song
    onAddCustomChord?: (chord: string) => void;
}

// Common chord degrees: 1, 4, 5 (major) and 6, 2, 3 (minor)
const MAJOR_CHORDS = ['1', '4', '5'];
const MINOR_CHORDS = ['6m', '2m', '3m'];

/**
 * One palette chip = one dnd-kit draggable (WP-166). Tap still inserts
 * (the 3px activation distance keeps clicks intact); drag places; the
 * alteration menu stays on contextmenu (mouse right-click / stationary
 * touch long-press).
 */
function ChordChip({
    chord,
    display,
    className,
    title,
    onTap,
    onMenu,
}: {
    chord: string;
    display: string;
    className: string;
    title?: string;
    onTap?: () => void;
    onMenu?: (x: number, y: number) => void;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `toolbar-chord:${chord}:${className}`,
        data: { chord, source: 'toolbar' } satisfies DraggedChord,
    });
    return (
        <button
            ref={setNodeRef}
            className={`${className} ${isDragging ? styles.dragging : ''}`}
            onClick={onTap}
            onContextMenu={(e) => {
                e.preventDefault();
                onMenu?.(e.clientX, e.clientY);
            }}
            data-chord={chord}
            {...(title !== undefined ? { title } : {})}
            {...attributes}
            {...listeners}
        >
            {display}
        </button>
    );
}

export function SongEditorToolbar({
    currentKey,
    chordStyle,
    lyricsLocked,
    onLockToggle,
    onChordClick,
    customChords = [],
    songChords = [],
    onAddCustomChord,
}: SongEditorToolbarProps) {
    const [menuOpen, setMenuOpen] = useState<{ chord: string; x: number; y: number } | null>(null);

    const formatChordForDisplay = (chordStr: string): string => {
        const parsed = parseNashville(chordStr);
        return parsed ? formatChord(parsed, currentKey, chordStyle) : chordStr;
    };

    const handleMenuSelect = (alteredChord: string) => {
        if (onAddCustomChord) {
            onAddCustomChord(alteredChord);
        }
        setMenuOpen(null);
    };

    return (
        <div className={styles.toolbar}>
            <div className={styles.chordPalette}>
                {MAJOR_CHORDS.map((chord) => (
                    <ChordChip
                        key={chord}
                        chord={chord}
                        display={formatChordForDisplay(chord)}
                        className={styles.chordButton}
                        {...(onChordClick ? { onTap: () => onChordClick(chord) } : {})}
                        onMenu={(x, y) => setMenuOpen({ chord, x, y })}
                    />
                ))}
                {MINOR_CHORDS.map((chord) => (
                    <ChordChip
                        key={chord}
                        chord={chord}
                        display={formatChordForDisplay(chord)}
                        className={`${styles.chordButton} ${styles.minor}`}
                        {...(onChordClick ? { onTap: () => onChordClick(chord) } : {})}
                        onMenu={(x, y) => setMenuOpen({ chord, x, y })}
                    />
                ))}
                {songChords.map((chord, i) => (
                    <ChordChip
                        key={`song-${chord}-${i}`}
                        chord={chord}
                        display={formatChordForDisplay(chord)}
                        className={`${styles.chordButton} ${styles.songChord}`}
                        title="From this song"
                        {...(onChordClick ? { onTap: () => onChordClick(chord) } : {})}
                    />
                ))}
                {customChords.map((chord, i) => (
                    <ChordChip
                        key={`${chord}-${i}`}
                        chord={chord}
                        display={formatChordForDisplay(chord)}
                        className={`${styles.chordButton} ${styles.customChord}`}
                    />
                ))}

                {/* Custom chord button */}
                <button
                    className={styles.customChordButton}
                    title="Add custom chord"
                    onClick={() => {/* TODO: Open manual input dialog? */ }}
                >
                    +
                </button>
            </div>

            {/* Lock lyrics button */}
            <button
                className={`${styles.lockButton} ${lyricsLocked ? styles.locked : ''}`}
                onClick={onLockToggle}
            >
                {lyricsLocked ? '🔒' : '🔓'}
            </button>

            {menuOpen && (
                <ChordAlterationMenu
                    baseChord={menuOpen.chord}
                    position={{ x: menuOpen.x, y: menuOpen.y }}
                    onClose={() => setMenuOpen(null)}
                    onSelect={handleMenuSelect}
                />
            )}
        </div>
    );
}
