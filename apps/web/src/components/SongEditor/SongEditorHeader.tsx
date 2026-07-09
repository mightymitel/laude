import { Key, ChordStyle } from '@laudasist/shared';
import { KEYS } from './songEditorModel';
import styles from './SongEditor.module.css';

interface SongEditorHeaderProps {
    title: string;
    author: string;
    originalKey: Key;
    chordStyle: ChordStyle;
    mode: 'visual' | 'raw';
    titleError: boolean;
    onTitleChange: (title: string) => void;
    onAuthorChange: (author: string) => void;
    onKeyChange: (key: Key) => void;
    onChordStyleChange: (style: ChordStyle) => void;
    onModeChange: (mode: 'visual' | 'raw') => void;
}

/** Song editor header: title, visual/raw mode toggle, author, key, and chord style. */
export function SongEditorHeader({
    title,
    author,
    originalKey,
    chordStyle,
    mode,
    titleError,
    onTitleChange,
    onAuthorChange,
    onKeyChange,
    onChordStyleChange,
    onModeChange,
}: SongEditorHeaderProps) {
    return (
        <div className={styles.header}>
            <div className={styles.titleRow}>
                <input
                    type="text"
                    className={`${styles.titleInput} ${titleError ? styles.invalid : ''}`}
                    placeholder="Song Title *"
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                />

                <div className={styles.modeToggle}>
                    <button
                        className={`${styles.modeButton} ${mode === 'visual' ? styles.active : ''}`}
                        onClick={() => onModeChange('visual')}
                    >
                        Visual
                    </button>
                    <button
                        className={`${styles.modeButton} ${mode === 'raw' ? styles.active : ''}`}
                        onClick={() => onModeChange('raw')}
                    >
                        Raw
                    </button>
                </div>
            </div>

            {titleError && <span className={styles.error}>Title is required</span>}

            <div className={styles.metaRow}>
                <input
                    type="text"
                    className={styles.metaInput}
                    placeholder="Author"
                    value={author}
                    onChange={(e) => onAuthorChange(e.target.value)}
                />

                <select
                    className={styles.select}
                    value={originalKey}
                    // Cast: the select's options are exactly KEYS, so the value is a Key.
                    onChange={(e) => onKeyChange(e.target.value as Key)}
                >
                    {KEYS.map(k => (
                        <option key={k} value={k}>{k}</option>
                    ))}
                </select>

                <select
                    className={styles.select}
                    value={chordStyle}
                    // Cast: the select's options are exactly the ChordStyle values below.
                    onChange={(e) => onChordStyleChange(e.target.value as ChordStyle)}
                >
                    <option value="letters">Letters (C, Am)</option>
                    <option value="nashville">Nashville (1, 6m)</option>
                    <option value="roman">Roman (I, vi)</option>
                </select>
            </div>
        </div>
    );
}
