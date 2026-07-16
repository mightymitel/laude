import { Dispatch, SetStateAction, useCallback } from 'react';
import { approximateChordsFromPart } from '@laude/chords';
import { Song, SongPart, PartType } from '@laudasist/shared';
import { autoSplitParts, generatePartId, parseRawSong } from './songEditorModel';

/**
 * Part- and line-level mutations for the song editor: add/remove/update parts,
 * edit lines, split/join parts, chord approximation, and raw-mode sync.
 */
export function usePartEditing(setEditingSong: Dispatch<SetStateAction<Partial<Song>>>) {
    // Part handlers
    const handleAddPart = useCallback((type: PartType) => {
        setEditingSong(prev => {
            const parts = prev.parts || [];
            const newPartId = generatePartId(type, parts);
            const index = parts.filter(p => p.type === type).length + 1;

            const newPart: SongPart = {
                id: newPartId,
                type,
                index,
                lines: [{ text: '' }],
            };

            return { ...prev, parts: [...parts, newPart] };
        });
    }, [setEditingSong]);

    const handleRemovePart = useCallback((partIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            parts.splice(partIndex, 1);
            return { ...prev, parts };
        });
    }, [setEditingSong]);

    const handleUpdatePart = useCallback((partIndex: number, updates: Partial<SongPart>) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            parts[partIndex] = { ...parts[partIndex], ...updates };
            // Auto-split parts with 3+ consecutive empty lines
            const splitParts = autoSplitParts(parts);
            return { ...prev, parts: splitParts };
        });
    }, [setEditingSong]);

    // Part reorder via drag handles (WP-167).
    const handleReorderParts = useCallback((from: number, to: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            if (from === to || from < 0 || to < 0 || from >= parts.length || to >= parts.length) return prev;
            const [moved] = parts.splice(from, 1);
            parts.splice(to, 0, moved!);
            return { ...prev, parts };
        });
    }, [setEditingSong]);


    // Line handlers
    const handleUpdateLine = useCallback((partIndex: number, lineIndex: number, text: string) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const lines = [...parts[partIndex].lines];
            lines[lineIndex] = { text };
            parts[partIndex] = { ...parts[partIndex], lines };
            return { ...prev, parts };
        });
    }, [setEditingSong]);

    const handleAddLine = useCallback((partIndex: number, afterLineIndex?: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const lines = [...parts[partIndex].lines];
            const insertIndex = afterLineIndex !== undefined ? afterLineIndex + 1 : lines.length;
            lines.splice(insertIndex, 0, { text: '' });
            parts[partIndex] = { ...parts[partIndex], lines };
            return { ...prev, parts };
        });
    }, [setEditingSong]);

    const handleDeleteLine = useCallback((partIndex: number, lineIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const part = parts[partIndex];

            // If this is the last line in the part, delete the entire part
            if (part.lines.length === 1) {
                parts.splice(partIndex, 1);
                return { ...prev, parts };
            }

            // Otherwise just delete the line
            const lines = [...part.lines];
            lines.splice(lineIndex, 1);
            parts[partIndex] = { ...part, lines };
            return { ...prev, parts };
        });
    }, [setEditingSong]);

    const handleSplitPart = useCallback((partIndex: number, atLineIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const part = parts[partIndex];

            // Can't split if we're at the first line or last line
            if (atLineIndex === 0 || atLineIndex >= part.lines.length - 1) {
                return prev;
            }

            // Split lines into two groups
            const firstPartLines = part.lines.slice(0, atLineIndex);
            const secondPartLines = part.lines.slice(atLineIndex + 1); // Skip the empty line

            // If either part would be empty, don't split
            if (firstPartLines.length === 0 || secondPartLines.length === 0) {
                return prev;
            }

            // Create the second part with same type
            const partCounts: Record<string, number> = {};
            parts.forEach(p => {
                partCounts[p.type] = (partCounts[p.type] || 0) + 1;
            });

            const newPart: SongPart = {
                id: generatePartId(part.type, parts),
                type: part.type,
                index: (partCounts[part.type] || 0) + 1,
                lines: secondPartLines,
            };

            // Update the original part with first half of lines
            parts[partIndex] = { ...part, lines: firstPartLines };

            // Insert new part after current
            parts.splice(partIndex + 1, 0, newPart);

            return { ...prev, parts };
        });
    }, [setEditingSong]);

    const handleJoinParts = useCallback((partIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            if (partIndex >= parts.length - 1) return prev; // No next part to join with

            const currentPart = parts[partIndex];
            const nextPart = parts[partIndex + 1];

            // Merge lines from both parts
            const mergedLines = [...currentPart.lines, ...nextPart.lines];

            // Update current part with merged lines
            parts[partIndex] = { ...currentPart, lines: mergedLines };

            // Remove next part
            parts.splice(partIndex + 1, 1);

            return { ...prev, parts };
        });
    }, [setEditingSong]);

    const handleApproximateChords = useCallback((targetPartIndex: number, sourcePartIndex: number) => {
        setEditingSong(prev => {
            const parts = [...(prev.parts || [])];
            const sourcePart = parts[sourcePartIndex];
            const targetPart = parts[targetPartIndex];

            if (!sourcePart || !targetPart) return prev;

            // Approximate chords from source to target (character-proportional)
            const updatedPart = approximateChordsFromPart(sourcePart, targetPart);

            parts[targetPartIndex] = updatedPart;

            return { ...prev, parts };
        });
    }, [setEditingSong]);

    // Raw mode sync - parse raw content back into structured parts
    const handleRawChange = useCallback((rawContent: string) => {
        setEditingSong(prev => ({ ...prev, parts: parseRawSong(rawContent) }));
    }, [setEditingSong]);

    return {
        handleAddPart,
        handleReorderParts,
        handleRemovePart,
        handleUpdatePart,
        handleUpdateLine,
        handleAddLine,
        handleDeleteLine,
        handleSplitPart,
        handleJoinParts,
        handleApproximateChords,
        handleRawChange,
    };
}
