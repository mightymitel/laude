// Pure (framework-agnostic) helpers for the song editor: empty-song scaffold,
// part ID generation, auto-splitting, and raw-mode parsing/serialization.
import { Song, SongPart, Key, PartType } from '@laudasist/shared';

export const KEYS: Key[] = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

export function createEmptySong(): Partial<Song> {
    return {
        title: '',
        author: '',
        originalKey: 'C',
        parts: [],
        tags: [],
        defaultArrangement: [],
        arrangements: [],
    };
}

export function generatePartId(type: PartType, existingParts: SongPart[]): string {
    const count = existingParts.filter(p => p.type === type).length;
    const prefix = type === 'verse' ? 'V' :
        type === 'chorus' ? 'C' :
            type === 'bridge' ? 'B' :
                type === 'pre-chorus' ? 'PC' :
                    type === 'intro' ? 'I' :
                        type === 'outro' ? 'O' : 'T';
    return `${prefix}${count + 1}`;
}

/**
 * Auto-split parts that have 3+ consecutive empty lines
 * Returns the updated parts array
 */
export function autoSplitParts(parts: SongPart[]): SongPart[] {
    const result: SongPart[] = [];

    for (const part of parts) {
        const lines = part.lines;
        const segments: { start: number; end: number }[] = [];
        let segmentStart = 0;
        let emptyCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const isEmpty = !lines[i]?.text.trim();

            if (isEmpty) {
                emptyCount++;
            } else {
                // If we had 3+ empty lines, split here
                if (emptyCount >= 3) {
                    // End previous segment before the empty lines
                    const segmentEnd = i - emptyCount;
                    if (segmentEnd > segmentStart) {
                        segments.push({ start: segmentStart, end: segmentEnd });
                    }
                    // Start new segment after empty lines
                    segmentStart = i;
                }
                emptyCount = 0;
            }
        }

        // Add final segment if not empty
        const finalEnd = lines.length - emptyCount;
        if (finalEnd > segmentStart) {
            segments.push({ start: segmentStart, end: finalEnd });
        }

        // Create parts from segments
        if (segments.length === 0) {
            // Keep part even if entirely empty
            result.push(part);
        } else if (segments.length === 1) {
            // No split needed, but remove trailing empty lines
            result.push({
                ...part,
                lines: lines.slice(segments[0].start, segments[0].end)
            });
        } else {
            // Split into multiple parts
            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];
                result.push({
                    ...part,
                    id: i === 0 ? part.id : `${part.id}-${i + 1}`,
                    index: i === 0 ? part.index : part.index + i,
                    lines: lines.slice(segment.start, segment.end)
                });
            }
        }
    }

    return result;
}

/** Parse raw-mode content (#part headers + lyric lines) into structured parts. */
export function parseRawSong(rawContent: string): SongPart[] {
    const parts: SongPart[] = [];
    const lines = rawContent.split('\n');

    let currentPart: SongPart | null = null;
    const partCounts: Record<string, number> = {};

    for (const line of lines) {
        // Check for part header: #verse 1, #chorus 1, etc.
        const headerMatch = line.match(/^#(\w+(?:-\w+)?)\s*(\d*)$/i);

        if (headerMatch) {
            // Save previous part if exists
            if (currentPart) {
                parts.push(currentPart);
            }

            // Cast: raw mode intentionally accepts any "#word" header as a part type.
            const partType = headerMatch[1].toLowerCase() as PartType;
            const explicitIndex = headerMatch[2] ? parseInt(headerMatch[2], 10) : null;

            // Track part counts for ID generation
            partCounts[partType] = (partCounts[partType] || 0) + 1;
            const index = explicitIndex || partCounts[partType];

            currentPart = {
                id: generatePartId(partType, parts),
                type: partType,
                index,
                lines: [],
            };
        } else if (currentPart) {
            // Add line to current part
            currentPart.lines.push({ text: line });
        } else if (line.trim()) {
            // No part yet, create a default verse
            currentPart = {
                id: generatePartId('verse', parts),
                type: 'verse',
                index: 1,
                lines: [{ text: line }],
            };
            partCounts['verse'] = 1;
        }
    }

    // Don't forget the last part
    if (currentPart) {
        parts.push(currentPart);
    }

    // Ensure at least one part exists
    if (parts.length === 0) {
        parts.push({
            id: 'V1',
            type: 'verse',
            index: 1,
            lines: [{ text: '' }],
        });
    }

    return parts;
}

/** Serialize structured parts to raw-mode content (#part headers + lyric lines). */
export function serializePartsToRaw(parts: SongPart[]): string {
    return parts
        .map(part => {
            const header = `#${part.type} ${part.index}`;
            const lines = part.lines.map(l => l.text).join('\n');
            return `${header}\n${lines}`;
        })
        .join('\n\n');
}
