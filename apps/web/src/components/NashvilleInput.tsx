
import { useState, useRef, useEffect } from 'react';
import styles from './NashvilleInput.module.css';

interface NashvilleInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function NashvilleInput({ value, onChange, placeholder }: NashvilleInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Basic helper: If user types '[' it starts a chord
    // We could add sophisticated helpers here later
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => onChange(value + '[1]')}>I</button>
        <button type="button" onClick={() => onChange(value + '[4]')}>IV</button>
        <button type="button" onClick={() => onChange(value + '[5]')}>V</button>
        <button type="button" onClick={() => onChange(value + '[6]')}>vi</button>
        <div className={styles.separator} />
        <span className={styles.hint}>Use [...] for chords, e.g., [1]Amazing [4]grace</span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={styles.textarea}
        placeholder={placeholder}
      />
    </div>
  );
}
