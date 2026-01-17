'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCreateSong } from '@/hooks/useSongs';
import { parseSongFromMarkdown, Key, ParsedSong, embedChordsInLine } from '@laudasist/shared';
import styles from './QuickAddForm.module.css';

const POSSIBLE_KEYS: Key[] = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

interface QuickAddFormProps {
    initialData?: {
        title: string;
        author: string;
        originalKey: Key;
        content: string;
    };
}

export function QuickAddForm({ initialData }: QuickAddFormProps) {
    const router = useRouter();
    const createSong = useCreateSong();

    const [title, setTitle] = useState(initialData?.title || '');
    const [author, setAuthor] = useState(initialData?.author || '');
    const [key, setKey] = useState<Key>(initialData?.originalKey || 'C');
    const [content, setContent] = useState(initialData?.content || '');

    const [preview, setPreview] = useState<ParsedSong | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Update state when initialData changes (for imports)
    useEffect(() => {
        if (initialData) {
            setTitle(initialData.title);
            setAuthor(initialData.author);
            setKey(initialData.originalKey);
            setContent(initialData.content);
        }
    }, [initialData]);

    // Live parse preview
    useEffect(() => {
        if (!content) {
            setPreview(null);
            return;
        }
        try {
            const parsed = parseSongFromMarkdown(content, key);
            setPreview(parsed);
            setError(null);
        } catch (e) {
            console.error(e);
            // Parser shouldn't usually throw, but just in case
        }
    }, [content, key]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !content || !preview) return;

        try {
            // Convert ParsedSong parts to valid SongPart objects for API
            const songParts = preview.parts.map((p) => ({
                id: crypto.randomUUID(), // Wrap this if needed for older environments
                type: p.type,
                index: p.index,
                lines: p.lines.map(l => ({
                    text: embedChordsInLine(l.text, l.chords)
                }))
            }));

            await createSong.mutateAsync({
                title,
                author,
                originalKey: key,
                parts: songParts,
                visibility: 'private',
            });
            router.push('/library'); // or to the song page
        } catch (err) {
            setError('Failed to create song: ' + (err as Error).message);
            console.error(err);
        }
    };

    return (
        <div className={styles.container}>
            <form onSubmit={handleSubmit} className={styles.formColumn}>
                <div className={styles.inputGroup}>
                    <label>Title</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        className={styles.inputField}
                    />
                </div>

                <div className={styles.inputGroup}>
                    <label>Author</label>
                    <input
                        type="text"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        className={styles.inputField}
                    />
                </div>

                <div className={styles.inputGroup}>
                    <label>Key</label>
                    <select
                        value={key}
                        onChange={(e) => setKey(e.target.value as Key)}
                        className={styles.inputField}
                    >
                        {POSSIBLE_KEYS.map(k => (
                            <option key={k} value={k}>{k}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.inputGroup}>
                    <label>
                        Lyrics & Chords (Markdown)
                    </label>
                    <div className={styles.helpText}>
                        Use [brackets] for chords. Use # Header for sections.
                    </div>
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={20}
                        className={styles.textArea}
                        placeholder="# Verse 1&#10;[C] Amazing [F] grace&#10;&#10;# Chorus&#10;[G] Praise God"
                    />
                </div>

                {error && <div className={styles.errorMessage}>{error}</div>}

                <button
                    type="submit"
                    disabled={createSong.isPending}
                    className={styles.submitButton}
                >
                    {createSong.isPending ? 'Saving...' : 'Create Song'}
                </button>
            </form>

            <div className={styles.previewColumn}>
                <h3>Preview</h3>
                <div className={styles.previewContent}>
                    {!preview ? (
                        <p className={styles.previewPlaceholder}>Start typing to see preview...</p>
                    ) : (
                        <div>
                            {preview.parts.map((part, i) => (
                                <div key={i} className={styles.previewPart}>
                                    <h4 className={styles.previewPartHeader}>
                                        {part.type} {part.index}
                                    </h4>
                                    {part.lines.map((line, j) => (
                                        <div key={j} className={styles.previewLine}>
                                            {/* 
                                                For this preview, we'll just reconstruct the line with brackets 
                                                to show we parsed it correctly. 
                                                Or we could try to render chords above text.
                                                For now simple reconstruction.
                                            */}
                                            {reconstructLine(line.text, line.chords)}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper to reconstruct line for preview (showing that we detected chords)
// We'll highlight chords in the preview
function reconstructLine(text: string, chords: any[]) {
    // We need to insert chords back into text
    // Sort chords by index desc
    const sorted = [...chords].sort((a, b) => b.index - a.index);
    let result = text;

    // We're working with the parsed Nashville chords here.
    // Ideally we'd show the original input or the nashville numbers.
    // Let's show Nashville numbers to confirm conversion worked.

    const elements = [];
    let lastIndex = 0;

    // Actually, reconstructing string is hard with React elements.
    // Let's try to build an array of segments.

    // Re-sorting ascending for building elements
    const sortedAsc = [...chords].sort((a, b) => a.index - b.index);

    if (sortedAsc.length === 0) return text;

    return (
        <span>
            {sortedAsc.map((chordPos, k) => {
                const prevText = text.substring(lastIndex, chordPos.index);
                lastIndex = chordPos.index;

                // Format chord for display (Nashville)
                const chordDisplay = `${chordPos.chord.degree}${chordPos.chord.quality || ''}`;

                return (
                    <span key={k}>
                        {prevText}
                        <span className={styles.chordHighlight}>
                            [{chordDisplay}]
                        </span>
                    </span>
                );
            })}
            {text.substring(lastIndex)}
        </span>
    );
}

