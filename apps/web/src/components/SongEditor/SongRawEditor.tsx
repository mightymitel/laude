import { useRef, useEffect } from 'react';
import styles from './SongEditor.module.css';

interface SongRawEditorProps {
    content: string;
    onContentChange: (content: string) => void;
}

export function SongRawEditor({ content, onContentChange }: SongRawEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Initialize with content when component mounts or content changes externally
    useEffect(() => {
        if (textareaRef.current && textareaRef.current.value !== content) {
            textareaRef.current.value = content;
        }
    }, [content]);

    // Expose current value via ref for parent to read on mode switch
    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        // Update parent when leaving (blur or unmount)
        const handleBlur = () => {
            if (textarea.value !== content) {
                onContentChange(textarea.value);
            }
        };

        textarea.addEventListener('blur', handleBlur);
        return () => {
            // On unmount, sync final value
            if (textarea.value !== content) {
                onContentChange(textarea.value);
            }
            textarea.removeEventListener('blur', handleBlur);
        };
    }, [content, onContentChange]);

    return (
        <textarea
            ref={textareaRef}
            className={styles.rawEditor}
            defaultValue={content}
            placeholder={`#Verse 1
[C]Amazing [F]grace how [G]sweet the sound
That [Am]saved a [F]wretch like [C]me

#Chorus
[G]I once was [C]lost but [F]now am [C]found
Was [Am]blind but [G]now I [C]see`}
        />
    );
}
