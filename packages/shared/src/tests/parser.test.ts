import { parseSongFromMarkdown } from '../parsers/song-parser';
import { parseAnyChord, letterToNashville } from '../chords/nashville';
import { romanToNashville } from '../chords/converters';

describe('Parser Tests', () => {
    describe('letterToNashville', () => {
        it('converts C in key of C to 1', () => {
            const result = letterToNashville('C', 'C');
            expect(result?.degree).toBe(1);
        });

        it('converts G7 in key of C to 5 with quality 7', () => {
            const result = letterToNashville('G7', 'C');
            expect(result?.degree).toBe(5);
            expect(result?.quality).toBe('7');
        });

        it('converts F#m in key of E to 2', () => {
            const result = letterToNashville('F#m', 'E');
            expect(result?.degree).toBe(2);
        });
    });

    describe('romanToNashville', () => {
        it('converts IV to 4', () => {
            const result = romanToNashville('IV');
            expect(result?.degree).toBe(4);
        });

        it('converts ii to 2 minor', () => {
            const result = romanToNashville('ii');
            expect(result?.degree).toBe(2);
            expect(result?.quality).toBe('m');
        });

        it('converts V/vi slash chord', () => {
            const result = romanToNashville('V/vi');
            expect(result?.degree).toBe(5);
            expect(result?.bass).toBe(6);
        });
    });

    describe('parseAnyChord', () => {
        it('parses Nashville "5" as degree 5', () => {
            const result = parseAnyChord('5', 'C');
            expect(result?.degree).toBe(5);
        });

        it('parses Letter "G" in C as degree 5', () => {
            const result = parseAnyChord('G', 'C');
            expect(result?.degree).toBe(5);
        });

        it('parses Roman "V" as degree 5', () => {
            const result = parseAnyChord('V', 'C');
            expect(result?.degree).toBe(5);
        });
    });

    describe('parseSongFromMarkdown', () => {
        it('parses simple song with verse', () => {
            const content = `# Verse 1
[C] Amazing [G] grace`;
            const result = parseSongFromMarkdown(content, 'C');
            expect(result.parts).toHaveLength(1);
            expect(result.parts[0]?.type.toLowerCase()).toBe('verse');
        });

        it('parses song with multiple parts', () => {
            const content = `# Verse 1
[C] Line 1

# Chorus
[G] Chorus line`;
            const result = parseSongFromMarkdown(content, 'C');
            expect(result.parts).toHaveLength(2);
            expect(result.parts[0]?.type.toLowerCase()).toBe('verse');
            expect(result.parts[1]?.type.toLowerCase()).toBe('chorus');
        });

        it('extracts chords from lines', () => {
            const content = `# Verse
[1] Amazing [4] grace`;
            const result = parseSongFromMarkdown(content, 'C');
            const verse = result.parts[0];
            expect(verse?.lines[0]?.chords).toHaveLength(2);
            expect(verse?.lines[0]?.chords[0]?.chord.degree).toBe(1);
            expect(verse?.lines[0]?.chords[1]?.chord.degree).toBe(4);
        });
    });
});
