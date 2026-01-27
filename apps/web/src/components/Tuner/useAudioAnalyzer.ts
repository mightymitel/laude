import { useState, useEffect, useRef } from 'react';

export interface TunerState {
    note: string;
    cents: number;
    frequency: number;
    isListening: boolean;
    error: string | null;
}

export function useAudioAnalyzer(active: boolean) {
    const [state, setState] = useState<TunerState>({
        note: '-',
        cents: 0,
        frequency: 0,
        isListening: false,
        error: null,
    });

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const rafIdRef = useRef<number | null>(null);
    const bufferRef = useRef<Float32Array | null>(null);

    useEffect(() => {
        if (active && !state.isListening && !state.error) {
            startListening();
        } else if (!active && state.isListening) {
            stopListening();
        }

        return () => {
            stopListening();
        };
    }, [active]);

    const startListening = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            sourceRef.current = source;
            bufferRef.current = new Float32Array(analyser.fftSize);

            setState(prev => ({ ...prev, isListening: true, error: null }));
            updatePitch();
        } catch (err) {
            console.error('Error accessing microphone:', err);
            setState(prev => ({ ...prev, error: 'Could not access microphone', isListening: false }));
        }
    };

    const stopListening = () => {
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        if (sourceRef.current) sourceRef.current.disconnect();
        if (analyserRef.current) analyserRef.current.disconnect();
        if (audioContextRef.current) audioContextRef.current.close();

        sourceRef.current = null;
        analyserRef.current = null;
        audioContextRef.current = null;
        setState(prev => ({ ...prev, isListening: false }));
    };

    const frequencyBufferRef = useRef<number[]>([]);

    const updatePitch = () => {
        if (!analyserRef.current || !bufferRef.current || !audioContextRef.current) return;

        analyserRef.current.getFloatTimeDomainData(bufferRef.current as any);
        const rawFrequency = autoCorrelate(bufferRef.current as Float32Array, audioContextRef.current.sampleRate);

        const rms = Math.sqrt(bufferRef.current.reduce((acc, val) => acc + val * val, 0) / bufferRef.current.length);

        // Noise gate (increased threshold)
        if (rms < 0.03) {
            // Decay buffer or clear it? Clearing might cause "drop to 0" quickly.
            // Better to just not update the note but perhaps indicate "listening..." or silence
            setState(prev => ({ ...prev, note: '-', cents: 0, frequency: 0 }));
            frequencyBufferRef.current = []; // Reset history on silence
        } else {
            if (rawFrequency !== -1) {
                const buffer = frequencyBufferRef.current;
                buffer.push(rawFrequency);
                if (buffer.length > 5) buffer.shift(); // Keep last 5 samples

                // Median filter to remove outliers
                const sorted = [...buffer].sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];

                // Optional: Smoothing (Average) slightly
                // For guitar, median is usually better to stick to a note, but average helps with cents jitter.
                // Let's use the median as the primary pitch source.

                const { note, cents } = getNote(median);
                setState(prev => ({ ...prev, note, cents, frequency: median }));
            }
        }

        rafIdRef.current = requestAnimationFrame(updatePitch);
    };

    return { ...state, analyser: analyserRef.current };
}

// Helpers
const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function getNote(frequency: number) {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    const midi = Math.round(noteNum) + 69;
    const note = NOTE_STRINGS[midi % 12];

    const standardFreq = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = Math.floor(1200 * Math.log(frequency / standardFreq) / Math.log(2));

    return { note, cents };
}

function autoCorrelate(buf: Float32Array, sampleRate: number): number {
    // Implements the ACF2+ algorithm
    let SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);

    if (rms < 0.01) // not enough signal
        return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++)
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++)
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    const c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++)
        for (let j = 0; j < SIZE - i; j++)
            c[i] = c[i] + buf[j] * buf[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    let T0 = maxpos;

    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
}
