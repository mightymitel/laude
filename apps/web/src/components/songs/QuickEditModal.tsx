
import { useState, useEffect } from 'react';
import { useUpdateSong } from '@/hooks/useSongs';
import { parseSongFromMarkdown, embedChordsInLine, Key, ParsedSong, Song } from '@laudasist/shared';
import styles from './QuickEditModal.module.css';

const POSSIBLE_KEYS: Key[] = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

interface QuickEditModalProps {
    song: Song;
    onClose: () => void;
    onSave?: () => void;
}

export function QuickEditModal({ song, onClose, onSave }: QuickEditModalProps) {
    const updateSong = useUpdateSong(song.id);

    const [title, setTitle] = useState(song.title);
    const [author, setAuthor] = useState(song.author || '');
    const [key, setKey] = useState<Key>(song.defaultKey);
    const [content, setContent] = useState('');
    const [preview, setPreview] = useState<ParsedSong | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Initialize content from song parts
    useEffect(() => {
        const contentLines: string[] = [];
        song.parts.forEach(part => {
            contentLines.push(`# ${part.type}${part.index > 0 ? ' ' + part.index : ''}`);
            part.lines.forEach(line => contentLines.push(line.text));
            contentLines.push('');
        });
        setContent(contentLines.join('\n').trim());
    }, [song]);

    // Live parse preview
    useEffect(() => {
        if (!content) return;
        try {
            const parsed = parseSongFromMarkdown(content, key);
            setPreview(parsed);
        } catch (e) {
            console.error(e);
        }
    }, [content, key]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !content || !preview) return;

        try {
            const songParts = preview.parts.map((p) => ({
                id: crypto.randomUUID(),
                type: p.type,
                index: p.index,
                lines: p.lines.map(l => ({
                    text: embedChordsInLine(l.text, l.chords)
                }))
            }));

            await updateSong.mutateAsync({
                title, author, defaultKey: key, parts: songParts
            });
            onSave?.();
            onClose();
        } catch (err) {
            setError('Failed to update: ' + (err as Error).message);
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>Quick Edit: {song.title}</h2>
                    <button onClick={onClose} className={styles.closeBtn}>×</button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.row}>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Title"
                            required
                            className={styles.input}
                        />
                        <input
                            type="text"
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            placeholder="Author"
                            className={styles.input}
                        />
                        <select
                            value={key}
                            onChange={(e) => setKey(e.target.value as Key)}
                            className={styles.select}
                        >
                            {POSSIBLE_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </div>

                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        rows={15}
                        className={styles.textarea}
                        placeholder="# Verse 1&#10;[C] Lyrics here"
                    />

                    {error && <div className={styles.error}>{error}</div>}

                    <div className={styles.actions}>
                        <button type="button" onClick={onClose} className={styles.cancelBtn}>
                            Cancel
                        </button>
                        <button type="submit" disabled={updateSong.isPending} className={styles.saveBtn}>
                            {updateSong.isPending ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
