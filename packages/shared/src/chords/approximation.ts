import type { SongPart, SongLine } from '../types/index.js';
import { extractChordsFromLine, embedChordsInLine, type ChordPosition } from './nashville.js';

/**
 * Language-specific syllable counting (future implementation)
 */
export type Language = 'ro' | 'en';

/**
 * Count syllables in a word (placeholder for future implementation)
 * Currently returns character count as a simple approximation
 */
function countSyllables(_word: string, _language: Language = 'ro'): number {
    // TODO: Implement proper syllable counting for Romanian
    // Romanian syllable rules:
    // - Each vowel or vowel group (diphthong/triphthong) is one syllable
    // - Vowels: a, ă, â, e, i, î, o, u
    // - Common diphthongs: ea, oa, ia, ie, io, iu, ua, uo, ui
    // - Triphthongs: eoa, ioa, iau

    // For now, return character count
    return _word.length;
}

/**
 * Calculate syllable positions for a text line
 * Returns cumulative syllable counts at each character position
 */
function calculateSyllablePositions(text: string, language: Language = 'ro'): number[] {
    const positions: number[] = [];
    let syllableCount = 0;
    let currentWord = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === ' ' || i === text.length - 1) {
            // End of word
            if (i === text.length - 1 && char !== ' ') {
                currentWord += char;
            }

            if (currentWord.length > 0) {
                syllableCount += countSyllables(currentWord, language);
                currentWord = '';
            }

            positions.push(syllableCount);
        } else {
            currentWord += char;
            positions.push(syllableCount);
        }
    }

    return positions;
}

/**
 * Map chord position from source line to target line
 * Uses character-based positioning for now, with placeholder for syllable-based positioning
 */
function mapChordPosition(
    sourceCharIndex: number,
    sourceText: string,
    targetText: string,
    useSyllables: boolean = false,
    language: Language = 'ro'
): number {
    if (!useSyllables) {
        // Simple character-based proportional mapping
        if (sourceText.length === 0) return 0;
        const ratio = sourceCharIndex / sourceText.length;
        return Math.round(ratio * targetText.length);
    }

    // TODO: Syllable-based mapping (future implementation)
    const sourceSyllables = calculateSyllablePositions(sourceText, language);
    const targetSyllables = calculateSyllablePositions(targetText, language);

    const sourceSyllableIndex = sourceSyllables[sourceCharIndex] || 0;
    const totalSourceSyllables = sourceSyllables[sourceSyllables.length - 1] || 1;
    const totalTargetSyllables = targetSyllables[targetSyllables.length - 1] || 1;

    // Calculate proportional syllable position
    const syllableRatio = sourceSyllableIndex / totalSourceSyllables;
    const targetSyllableCount = Math.round(syllableRatio * totalTargetSyllables);

    // Find character position that corresponds to target syllable count
    for (let i = 0; i < targetSyllables.length; i++) {
        const syllableCount = targetSyllables[i];
        if (syllableCount !== undefined && syllableCount >= targetSyllableCount) {
            return i;
        }
    }

    return targetText.length;
}

/**
 * Approximate chords from source line to target line
 */
function approximateChordsForLine(
    sourceLine: SongLine,
    targetLine: SongLine,
    options: {
        useSyllables?: boolean;
        language?: Language;
    } = {}
): SongLine {
    const { useSyllables = false, language = 'ro' } = options;

    // Extract chords and clean text from source
    const { text: sourceText, chords: sourceChords } = extractChordsFromLine(sourceLine.text);

    // Get clean text from target (preserve lyrics, replace chords)
    const { text: targetText } = extractChordsFromLine(targetLine.text);

    // Map each source chord to a position in the target text
    const targetChords: ChordPosition[] = sourceChords.map(({ chord, index }) => {
        const mappedIndex = mapChordPosition(index, sourceText, targetText, useSyllables, language);
        return { chord, index: mappedIndex };
    });

    // Embed chords back into target text
    const newText = embedChordsInLine(targetText, targetChords);

    return { text: newText };
}

/**
 * Approximate chords from source part to target part
 *
 * @param sourcePart - The part to copy chords from
 * @param targetPart - The part to apply chords to
 * @param options - Configuration options
 * @returns New target part with approximated chords
 */
export function approximateChordsFromPart(
    sourcePart: SongPart,
    targetPart: SongPart,
    options: {
        useSyllables?: boolean;
        language?: Language;
    } = {}
): SongPart {
    const sourceLines = sourcePart.lines;
    const targetLines = targetPart.lines;

    // If source has no lines, return target unchanged
    if (sourceLines.length === 0) {
        return targetPart;
    }

    // Map each target line to a source line (loop if needed)
    const newLines: SongLine[] = targetLines.map((targetLine, targetIndex) => {
        // Use modulo to loop through source lines if target has more lines
        const sourceIndex = targetIndex % sourceLines.length;
        const sourceLine = sourceLines[sourceIndex];

        if (!sourceLine) {
            return targetLine;
        }

        return approximateChordsForLine(sourceLine, targetLine, options);
    });

    return {
        ...targetPart,
        lines: newLines,
    };
}

/**
 * Copy chords exactly from source part to target part
 * Only copies to lines that exist in both parts
 */
export function copyChordsFromPart(
    sourcePart: SongPart,
    targetPart: SongPart
): SongPart {
    const sourceLines = sourcePart.lines;
    const targetLines = targetPart.lines;

    const minLength = Math.min(sourceLines.length, targetLines.length);

    const newLines: SongLine[] = targetLines.map((targetLine, index) => {
        if (index < minLength) {
            const sourceLine = sourceLines[index];
            if (!sourceLine) {
                return targetLine;
            }

            const { chords } = extractChordsFromLine(sourceLine.text);
            const { text: targetText } = extractChordsFromLine(targetLine.text);

            // Embed source chords into target text
            const newText = embedChordsInLine(targetText, chords);
            return { text: newText };
        }
        return targetLine;
    });

    return {
        ...targetPart,
        lines: newLines,
    };
}
