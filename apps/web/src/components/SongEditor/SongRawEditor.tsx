import { useState, useEffect, useRef } from 'react';
import styles from './SongEditor.module.css';

interface SongRawEditorProps {
    content: string;
    onChange: (content: string) => void;
}

export function SongRawEditor({ content, onChange }: SongRawEditorProps) {
    // Use local state to avoid cursor jumping on every keystroke
    const [localContent, setLocalContent] = useState(content);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isInternalChange = useRef(false);

    // Sync from parent only when content changes externally (e.g., mode switch)
    useEffect(() => {
        if (!isInternalChange.current) {
            setLocalContent(content);
        }
        isInternalChange.current = false;
    }, [content]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalContent(e.target.value);
    };

    const handleBlur = () => {
        // Only sync to parent on blur to avoid re-parsing on every keystroke
        if (localContent !== content) {
            isInternalChange.current = true;
            onChange(localContent);
        }
    };

    return (
        <textarea
            ref={textareaRef}
            className={styles.rawEditor}
            value={localContent}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder={`#Verse 1
[C]Amazing [F]grace how [G]sweet the sound
That [Am]saved a [F]wretch like [C]me

#Chorus
[G]I once was [C]lost but [F]now am [C]found
Was [Am]blind but [G]now I [C]see`}
        />
    );
}
