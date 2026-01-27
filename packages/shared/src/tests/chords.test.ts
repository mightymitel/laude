import { formatChord, parseNashville, extractChordsFromLine, letterToNashville, NashvilleChord } from '../chords/nashville';
import type { ChordQuality } from '../types';

describe('Chord Utilities', () => {
    describe('parseNashville', () => {
        it('parses simple degree', () => {
            const result = parseNashville('1');
            expect(result).toEqual({ degree: 1, quality: '', accidental: undefined, bass: undefined, bassAccidental: undefined });
        });

        it('parses degree with flat accidental', () => {
            const result = parseNashville('b7');
            expect(result?.degree).toBe(7);
            expect(result?.accidental).toBe('b');
        });

        it('parses degree with quality', () => {
            const result = parseNashville('5maj7');
            expect(result?.degree).toBe(5);
            expect(result?.quality).toBe('maj7');
        });

        it('parses slash chord', () => {
            const result = parseNashville('1/5');
            expect(result?.degree).toBe(1);
            expect(result?.bass).toBe(5);
        });

        it('returns null for invalid input', () => {
            expect(parseNashville('invalid')).toBeNull();
            expect(parseNashville('8')).toBeNull();
        });
    });

    describe('formatChord', () => {
        const testChord: NashvilleChord = { degree: 1, quality: '' as ChordQuality };

        it('formats as Nashville', () => {
            expect(formatChord(testChord, 'C', 'nashville')).toBe('1');
        });

        it('formats as letters in key of C', () => {
            expect(formatChord(testChord, 'C', 'letters')).toBe('C');
        });

        it('formats as letters in key of G', () => {
            expect(formatChord(testChord, 'G', 'letters')).toBe('G');
        });

        it('formats as Roman numeral', () => {
            expect(formatChord(testChord, 'C', 'roman')).toBe('I');
        });

        it('formats minor chord as lowercase Roman', () => {
            const minorChord: NashvilleChord = { degree: 2, quality: 'm' as ChordQuality };
            expect(formatChord(minorChord, 'C', 'roman')).toBe('ii');
        });

        it('formats as caseSensitive - major uppercase', () => {
            expect(formatChord(testChord, 'C', 'caseSensitive')).toBe('C');
        });

        it('formats as caseSensitive - minor lowercase', () => {
            const minorChord: NashvilleChord = { degree: 6, quality: 'm' as ChordQuality };
            expect(formatChord(minorChord, 'C', 'caseSensitive')).toBe('a');
        });
    });

    describe('extractChordsFromLine', () => {
        it('extracts chords from line with Nashville notation', () => {
            const result = extractChordsFromLine('[1]Amazing [4]grace');
            expect(result.text).toBe('Amazing grace');
            expect(result.chords).toHaveLength(2);
            expect(result.chords[0]?.chord.degree).toBe(1);
            expect(result.chords[0]?.index).toBe(0);
            expect(result.chords[1]?.chord.degree).toBe(4);
        });

        it('returns empty chords for line without chords', () => {
            const result = extractChordsFromLine('Just plain text');
            expect(result.text).toBe('Just plain text');
            expect(result.chords).toHaveLength(0);
        });
    });

    describe('letterToNashville', () => {
        it('converts C to 1 in key of C', () => {
            const result = letterToNashville('C', 'C');
            expect(result?.degree).toBe(1);
        });

        it('converts G to 5 in key of C', () => {
            const result = letterToNashville('G', 'C');
            expect(result?.degree).toBe(5);
        });

        it('converts Am to 6 in key of C', () => {
            const result = letterToNashville('Am', 'C');
            expect(result?.degree).toBe(6);
            expect(result?.quality).toBe('m');
        });

        it('returns null for invalid chord', () => {
            expect(letterToNashville('invalid', 'C')).toBeNull();
        });
    });

    describe('extractChordsFromLine - edge cases', () => {
        it('handles empty line', () => {
            const result = extractChordsFromLine('');
            expect(result.text).toBe('');
            expect(result.chords).toHaveLength(0);
        });

        it('handles line with leading whitespace and chord', () => {
            const result = extractChordsFromLine('  [1]Amazing grace');
            expect(result.text).toBe('  Amazing grace');
            expect(result.chords).toHaveLength(1);
            expect(result.chords[0]?.index).toBe(2); // After 2 spaces
        });

        it('handles multiple chords at same position', () => {
            const result = extractChordsFromLine('[1][4]Word');
            expect(result.text).toBe('Word');
            expect(result.chords).toHaveLength(2);
            expect(result.chords[0]?.index).toBe(0);
            expect(result.chords[1]?.index).toBe(0);
        });

        it('handles chord at end of line', () => {
            const result = extractChordsFromLine('End [1]');
            expect(result.text).toBe('End ');
            expect(result.chords).toHaveLength(1);
            expect(result.chords[0]?.index).toBe(4);
        });

        it('preserves character indices correctly with multiple chords', () => {
            const result = extractChordsFromLine('[1]A [4]B [5]C');
            expect(result.text).toBe('A B C');
            expect(result.chords[0]?.index).toBe(0); // Before 'A'
            expect(result.chords[1]?.index).toBe(2); // Before 'B'
            expect(result.chords[2]?.index).toBe(4); // Before 'C'
        });

        it('handles chord with quality', () => {
            const result = extractChordsFromLine('[1maj7]Word');
            expect(result.text).toBe('Word');
            expect(result.chords).toHaveLength(1);
            expect(result.chords[0]?.chord.degree).toBe(1);
            expect(result.chords[0]?.chord.quality).toBe('maj7');
        });

        it('handles slash chord', () => {
            const result = extractChordsFromLine('[1/5]Word');
            expect(result.text).toBe('Word');
            expect(result.chords).toHaveLength(1);
            expect(result.chords[0]?.chord.degree).toBe(1);
            expect(result.chords[0]?.chord.bass).toBe(5);
        });

        it('handles non-chord brackets', () => {
            const result = extractChordsFromLine('[not a chord] [1]Word');
            expect(result.text).toBe('[not a chord] Word');
            expect(result.chords).toHaveLength(1);
            expect(result.chords[0]?.chord.degree).toBe(1);
        });
    });
});
