import { useState, useRef } from 'react';
import { Key, ChordStyle, formatChord, parseNashville } from '@laudasist/shared';
import { ChordAlterationMenu } from './ChordAlterationMenu';
import { DraggedChord } from './types';
import styles from './SongEditor.module.css';

interface SongEditorToolbarProps {
    currentKey: Key;
    chordStyle: ChordStyle;
    lyricsLocked: boolean;
    onLockToggle: () => void;
    onChordDragStart: (chord: DraggedChord) => void;
    customChords?: string[];
    songChords?: string[];  // Chords extracted from current song
    onAddCustomChord?: (chord: string) => void;
}

// Common chord degrees: 1, 4, 5 (major) and 6, 2, 3 (minor)
const MAJOR_CHORDS = ['1', '4', '5'];
const MINOR_CHORDS = ['6m', '2m', '3m'];

export function SongEditorToolbar({
    currentKey,
    chordStyle,
    lyricsLocked,
    onLockToggle,
    onChordDragStart,
    customChords = [],
    songChords = [],
    onAddCustomChord,
}: SongEditorToolbarProps) {
    const [menuOpen, setMenuOpen] = useState<{ chord: string; x: number; y: number } | null>(null);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const handleDragStart = (e: React.DragEvent, chordDegree: string) => {
        if (menuOpen) return; // Don't drag if menu is trying to open

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', chordDegree);

        onChordDragStart({
            chord: chordDegree,
            source: 'toolbar',
        });
    };

    // Long press handlers
    const handleTouchStart = (e: React.TouchEvent, chord: string) => {
        const touch = e.touches[0];
        const x = touch.clientX;
        const y = touch.clientY;

        longPressTimer.current = setTimeout(() => {
            setMenuOpen({ chord, x, y });
        }, 500); // 500ms long press
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, chord: string) => {
        e.preventDefault();
        setMenuOpen({ chord, x: e.clientX, y: e.clientY });
    };

    const formatChordForDisplay = (degree: string): string => {
        try {
            const parsed = parseNashville(degree);
            if (parsed) {
                const result = formatChord(parsed, currentKey, chordStyle);
                return result || degree;
            }
        } catch {
            // Fall through to default
        }
        return degree;
    };

    const handleMenuSelect = (chord: string) => {
        if (onAddCustomChord) {
            onAddCustomChord(chord);
        }
        setMenuOpen(null);
    };

    return (
        <div className={styles.toolbar}>
            <div className={styles.chordPalette}>
                {/* Major chords */}
                {MAJOR_CHORDS.map(chord => (
                    <button
                        key={chord}
                        className={styles.chordButton}
                        draggable
                        onDragStart={(e) => handleDragStart(e, chord)}
                        onTouchStart={(e) => handleTouchStart(e, chord)}
                        onTouchEnd={handleTouchEnd}
                        onContextMenu={(e) => handleContextMenu(e, chord)}
                    >
                        {formatChordForDisplay(chord)}
                    </button>
                ))}

                {/* Minor chords */}
                {MINOR_CHORDS.map(chord => (
                    <button
                        key={chord}
                        className={`${styles.chordButton} ${styles.minor}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, chord)}
                        onTouchStart={(e) => handleTouchStart(e, chord)}
                        onTouchEnd={handleTouchEnd}
                        onContextMenu={(e) => handleContextMenu(e, chord)}
                    >
                        {formatChordForDisplay(chord)}
                    </button>
                ))}

                {/* Chords from current song */}
                {songChords.map((chord, i) => (
                    <button
                        key={`song-${chord}-${i}`}
                        className={`${styles.chordButton} ${styles.songChord}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, chord)}
                        onTouchStart={(e) => handleTouchStart(e, chord)}
                        onTouchEnd={handleTouchEnd}
                        onContextMenu={(e) => handleContextMenu(e, chord)}
                        title="From this song"
                    >
                        {formatChordForDisplay(chord)}
                    </button>
                ))}

                {/* Custom/Added chords */}
                {customChords.map((chord, i) => (
                    <button
                        key={`${chord}-${i}`}
                        className={`${styles.chordButton} ${styles.customChord}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, chord)}
                    >
                        {formatChordForDisplay(chord)}
                    </button>
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
