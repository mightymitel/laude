// Pure helpers for editing the chords embedded in a lyric line's text.
// Lines store chords inline as [nashville] markers; these helpers rebuild
// that text from a pure-text + chord-positions representation.
import {
    ChordPosition, Key, NashvilleChord,
    extractChordsFromLine, formatChord, parseNashville,
} from '@laudasist/shared';

/** Parse a nashville chord string, falling back to a plain "1" chord. */
export function toNashvilleChord(chordStr: string): NashvilleChord {
    return parseNashville(chordStr) || { degree: 1, quality: '' };
}

/** Rebuild a line's text by embedding the given chords as [nashville] markers. */
export function rebuildLineWithChords(pureText: string, chords: ChordPosition[], key: Key): string {
    let newText = '';
    let lastIndex = 0;
    for (const c of chords) {
        newText += pureText.substring(lastIndex, c.index);
        newText += `[${formatChord(c.chord, key, 'nashville')}]`;
        lastIndex = c.index;
    }
    newText += pureText.substring(lastIndex);
    return newText;
}

/** Filter out the chord occurrence matching the given character index + nashville string. */
export function withoutChordAt(chords: ChordPosition[], charIndex: number, chordStr: string, key: Key): ChordPosition[] {
    return chords.filter(c =>
        !(c.index === charIndex &&
            formatChord(c.chord, key, 'nashville') === chordStr)
    );
}

/** Remove the chord occurrence matching charIndex + nashville string from a line's text. */
export function removeChordFromLine(lineText: string, charIndex: number, chordStr: string, key: Key): string {
    const { text: pureText, chords } = extractChordsFromLine(lineText);
    const remainingChords = withoutChordAt(chords, charIndex, chordStr, key);
    return rebuildLineWithChords(pureText, remainingChords, key);
}
