/**
 * Instrument tuner. Detection lives in @laude/tuner (pitchy / MPM with gates,
 * median smoothing and hysteresis); this component owns the mic permission
 * (requested on mount — the tuner only mounts when opened), the mode and
 * notation controls, and the stable note readout. The needle is drawn by
 * TunerGauge at rAF, decoupled from detection.
 */
import { useState } from 'react';
import { englishNotation, getNotation, listNotations, type PitchClass } from '@laude/chords';
import { TunerGauge } from './TunerGauge';
import { useTuner, type TunerTarget, type TuningMode } from './useTuner';
import styles from './Tuner.module.css';

interface TunerProps {
    mode?: 'full' | 'mini';
}

const NOTATION_STORAGE_KEY = 'tuner.notation';
const PITCH_CLASSES: readonly PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function loadNotationId(): string {
    try {
        return localStorage.getItem(NOTATION_STORAGE_KEY) ?? englishNotation.id;
    } catch {
        // Storage can be unavailable (privacy modes); fall back to the default.
        return englishNotation.id;
    }
}

function saveNotationId(id: string): void {
    try {
        localStorage.setItem(NOTATION_STORAGE_KEY, id);
    } catch {
        // Persistence is best-effort; the in-memory selection still applies.
    }
}

function noteName(noteIndex: number, notationId: string): string {
    const notation = getNotation(notationId) ?? englishNotation;
    return notation.format({ root: PITCH_CLASSES[noteIndex], quality: '', accidental: 'sharp' });
}

// Nashville is key-relative — meaningless for a tuner, so it is not offered.
const NOTATIONS = listNotations().filter((n) => n.id !== 'nashville');

const STATUS_TEXT = {
    requesting: 'Requesting microphone…',
    denied: 'Microphone access was denied. Allow the microphone for this site in your browser settings, then reopen the tuner.',
    error: 'Could not access the microphone. Check that one is connected and not in use by another app.',
    insecure:
        'The browser only allows microphone access on secure pages (HTTPS or localhost). Open the app over HTTPS — or on the dev box itself — to use the tuner.',
} as const;

function NoteReadout({ target, notationId }: { target: TunerTarget; notationId: string }) {
    const inTuneClass = target.inTune ? ` ${styles.inTune}` : '';
    return (
        <div className={styles.noteReadout + inTuneClass}>
            <div className={styles.noteName}>
                {target.noteIndex === null ? '–' : noteName(target.noteIndex, notationId)}
                {target.octave !== null && <span className={styles.octave}>{target.octave}</span>}
            </div>
            <div className={styles.noteMeta}>
                {target.stringNumber !== null
                    ? `String ${target.stringNumber}`
                    : target.idle
                      ? 'Play a note'
                      : ' '}
            </div>
        </div>
    );
}

export function Tuner({ mode = 'full' }: TunerProps) {
    const [tuningMode, setTuningMode] = useState<TuningMode>('chromatic');
    const [notationId, setNotationId] = useState<string>(loadNotationId);
    const { status, target, readingRef } = useTuner(tuningMode);
    const compact = mode === 'mini';

    const modeButton = (value: TuningMode, label: string) => (
        <button
            type="button"
            className={tuningMode === value ? styles.modeBtnActive : styles.modeBtn}
            aria-pressed={tuningMode === value}
            onClick={() => setTuningMode(value)}
        >
            {label}
        </button>
    );

    return (
        <div className={compact ? styles.containerMini : styles.container}>
            {!compact && <h1 className={styles.title}>Tuner</h1>}

            <div className={styles.controls}>
                <div className={styles.modeToggle} role="group" aria-label="Tuning mode">
                    {modeButton('chromatic', 'Chromatic')}
                    {modeButton('guitar', 'Guitar')}
                </div>
                <select
                    className={styles.notationSelect}
                    aria-label="Note names"
                    value={notationId}
                    onChange={(e) => {
                        setNotationId(e.target.value);
                        saveNotationId(e.target.value);
                    }}
                >
                    {NOTATIONS.map((n) => (
                        <option key={n.id} value={n.id}>
                            {n.label}
                        </option>
                    ))}
                </select>
            </div>

            {status === 'listening' ? (
                <>
                    <NoteReadout target={target} notationId={notationId} />
                    <TunerGauge readingRef={readingRef} mode={tuningMode} compact={compact} />
                </>
            ) : (
                <p className={styles.status}>{STATUS_TEXT[status]}</p>
            )}
        </div>
    );
}
