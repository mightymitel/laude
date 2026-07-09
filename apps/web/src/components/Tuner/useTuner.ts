/**
 * Mic + detector lifecycle for the Tuner UI. Requests the microphone on mount
 * (the tuner only mounts when opened), runs @laude/tuner's pitch detector, and
 * splits its output in two:
 *
 * - `readingRef`: the latest raw reading, updated at detection rate (~20 Hz),
 *   consumed imperatively by the canvas gauge at rAF — no React re-renders.
 * - `target`: discrete display identity (note / string / in-tune), a React
 *   state that only changes when the label actually changes.
 */
import { useEffect, useRef, useState } from 'react';
import {
    centsToGuitarString,
    createPitchDetector,
    nearestGuitarString,
    noteIndexOf,
    octaveOf,
    type TunerReading,
} from '@laude/tuner';

export type TuningMode = 'chromatic' | 'guitar';
export type MicStatus = 'requesting' | 'listening' | 'denied' | 'error';

export interface TunerTarget {
    idle: boolean;
    /** Pitch class (0–11) of the displayed note (locked note or guitar string). */
    noteIndex: number | null;
    octave: number | null;
    /** Guitar mode only: conventional string number (6 = low E). */
    stringNumber: number | null;
    inTune: boolean;
}

export const IDLE_READING: TunerReading = {
    hz: null,
    midi: null,
    noteIndex: null,
    octave: null,
    cents: null,
    clarity: 0,
    level: 0,
};

const IDLE_TARGET: TunerTarget = {
    idle: true,
    noteIndex: null,
    octave: null,
    stringNumber: null,
    inTune: false,
};

/** Cents deviation for the current mode (guitar snaps to the nearest string). */
export function modeCents(reading: TunerReading, mode: TuningMode): number | null {
    if (reading.midi === null || reading.cents === null) return null;
    if (mode === 'chromatic') return reading.cents;
    return centsToGuitarString(reading.midi, nearestGuitarString(reading.midi));
}

// In-tune indicator has its own hysteresis so it never flaps at the boundary.
const IN_TUNE_ENTER_CENTS = 4;
const IN_TUNE_EXIT_CENTS = 7;

function deriveTarget(prev: TunerTarget, reading: TunerReading, mode: TuningMode): TunerTarget {
    const cents = modeCents(reading, mode);
    if (reading.midi === null || cents === null) {
        return prev.idle ? prev : IDLE_TARGET;
    }
    const displayMidi =
        mode === 'guitar' ? nearestGuitarString(reading.midi).midi : reading.midi;
    const next: TunerTarget = {
        idle: false,
        noteIndex: mode === 'guitar' ? noteIndexOf(displayMidi) : reading.noteIndex,
        octave: mode === 'guitar' ? octaveOf(displayMidi) : reading.octave,
        stringNumber: mode === 'guitar' ? nearestGuitarString(reading.midi).number : null,
        inTune: Math.abs(cents) <= (prev.inTune ? IN_TUNE_EXIT_CENTS : IN_TUNE_ENTER_CENTS),
    };
    const same =
        prev.idle === next.idle &&
        prev.noteIndex === next.noteIndex &&
        prev.octave === next.octave &&
        prev.stringNumber === next.stringNumber &&
        prev.inTune === next.inTune;
    return same ? prev : next;
}

export function useTuner(mode: TuningMode) {
    const [status, setStatus] = useState<MicStatus>('requesting');
    const [target, setTarget] = useState<TunerTarget>(IDLE_TARGET);
    const readingRef = useRef<TunerReading>(IDLE_READING);
    const modeRef = useRef<TuningMode>(mode);

    // Re-derive the label immediately when the mode toggles.
    useEffect(() => {
        modeRef.current = mode;
        setTarget((prev) => deriveTarget(prev, readingRef.current, mode));
    }, [mode]);

    useEffect(() => {
        let cancelled = false;
        let stream: MediaStream | null = null;
        const detector = createPitchDetector();
        const unsubscribe = detector.subscribe((reading) => {
            readingRef.current = reading;
            setTarget((prev) => deriveTarget(prev, reading, modeRef.current));
        });

        navigator.mediaDevices
            // Voice processing distorts pitch; ask for a raw signal.
            .getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            })
            .then((s) => {
                if (cancelled) {
                    s.getTracks().forEach((t) => t.stop());
                    return;
                }
                stream = s;
                detector.start(s);
                setStatus('listening');
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                const denied =
                    err instanceof DOMException &&
                    (err.name === 'NotAllowedError' || err.name === 'SecurityError');
                setStatus(denied ? 'denied' : 'error');
            });

        return () => {
            cancelled = true;
            unsubscribe();
            detector.stop();
            stream?.getTracks().forEach((t) => t.stop());
            readingRef.current = IDLE_READING;
        };
    }, []);

    return { status, target, readingRef };
}
