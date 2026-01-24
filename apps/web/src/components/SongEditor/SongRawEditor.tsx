import styles from './SongEditor.module.css';

interface SongRawEditorProps {
    content: string;
    onChange: (content: string) => void;
}

export function SongRawEditor({ content, onChange }: SongRawEditorProps) {
    return (
        <textarea
            className={styles.rawEditor}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`#Verse 1
[C]Amazing [F]grace how [G]sweet the sound
That [Am]saved a [F]wretch like [C]me

#Chorus
[G]I once was [C]lost but [F]now am [C]found
Was [Am]blind but [G]now I [C]see`}
        />
    );
}
