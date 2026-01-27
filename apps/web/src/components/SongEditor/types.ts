// SongEditor Types
import { Song, SongPart, Key, ChordStyle } from '@laudasist/shared';

export interface SongEditorProps {
    /** Initial song data for editing, or undefined for new song */
    song?: Song;

    /** Chord display style - can be passed from session context */
    chordStyle?: ChordStyle;

    /** Display key for preview */
    displayKey?: Key;

    /** Starting mode */
    defaultMode?: 'visual' | 'raw';

    /** Called when user saves the song */
    onSave?: (song: Song) => void;

    /** Called when user cancels editing */
    onCancel?: () => void;

    /** Container variant affects sizing/padding */
    variant?: 'page' | 'modal' | 'drawer';
}

export interface EditableSongPart extends SongPart {
    /** Temporary ID for new parts not yet saved */
    tempId?: string;
}

export interface DraggedChord {
    /** Nashville number chord representation */
    chord: string;
    /** Source: 'toolbar' for new chords, 'line' for existing */
    source: 'toolbar' | 'line';
    /** Original position if dragging from line */
    originalPartIndex?: number;
    originalLineIndex?: number;
    originalCharIndex?: number;
}

export interface DropPosition {
    partIndex: number;
    lineIndex: number;
    charIndex: number;
}
