import { useState, useEffect, useRef, useCallback } from 'react';
import type { Key, PadStyle } from '@laudasist/shared';
import { getPadUrl, getPadKey } from '@laudasist/shared';

interface UseWorshipPadOptions {
    displayKey: Key;
    style?: PadStyle;
}

interface UseWorshipPadReturn {
    isPlaying: boolean;
    isLoading: boolean;
    volume: number;
    play: () => void;
    stop: () => void;
    setVolume: (volume: number) => void;
}

const CROSSFADE_DURATION = 2.5; // seconds

export function useWorshipPad({ displayKey, style = 'foundations' }: UseWorshipPadOptions): UseWorshipPadReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [volume, setVolumeState] = useState(0.5); // 0 to 1

    // Audio context and nodes
    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const currentGainRef = useRef<GainNode | null>(null);

    // Buffer cache
    const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());

    // Current key tracking
    const currentKeyRef = useRef<string>(getPadKey(displayKey));

    // Initialize audio context and master gain
    const initAudioContext = useCallback(() => {
        if (audioContextRef.current) return audioContextRef.current;

        const ctx = new AudioContext();
        audioContextRef.current = ctx;

        const masterGain = ctx.createGain();
        masterGain.gain.value = volume;
        masterGain.connect(ctx.destination);
        masterGainRef.current = masterGain;

        return ctx;
    }, [volume]);

    // Load audio buffer for a key
    const loadAudioBuffer = useCallback(async (key: Key): Promise<AudioBuffer> => {
        const padKey = getPadKey(key);

        // Check cache
        const cached = bufferCacheRef.current.get(padKey);
        if (cached) return cached;

        // Fetch and decode
        const url = getPadUrl(key, style);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load pad audio: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const ctx = audioContextRef.current;
        if (!ctx) throw new Error('Audio context not initialized');

        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        // Cache it
        bufferCacheRef.current.set(padKey, audioBuffer);

        return audioBuffer;
    }, [style]);

    // Create and start a source node
    const createSource = useCallback((buffer: AudioBuffer, startGain: number): { source: AudioBufferSourceNode; gain: GainNode } => {
        const ctx = audioContextRef.current;
        const masterGain = masterGainRef.current;
        if (!ctx || !masterGain) throw new Error('Audio context not initialized');

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const gain = ctx.createGain();
        gain.gain.value = startGain;

        source.connect(gain);
        gain.connect(masterGain);

        source.start(0);

        return { source, gain };
    }, []);

    // Stop and clean up a source
    const cleanupSource = useCallback((source: AudioBufferSourceNode | null, gain: GainNode | null) => {
        if (source) {
            try {
                source.stop();
                source.disconnect();
            } catch (e) {
                // Ignore if already stopped
            }
        }
        if (gain) {
            try {
                gain.disconnect();
            } catch (e) {
                // Ignore
            }
        }
    }, []);

    // Play function
    const play = useCallback(async () => {
        try {
            setIsLoading(true);
            const ctx = initAudioContext();

            // Resume if suspended (browser autoplay policy)
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            const buffer = await loadAudioBuffer(displayKey);
            const { source, gain } = createSource(buffer, volume);

            currentSourceRef.current = source;
            currentGainRef.current = gain;
            currentKeyRef.current = getPadKey(displayKey);

            setIsPlaying(true);
        } catch (error) {
            console.error('Failed to play worship pad:', error);
        } finally {
            setIsLoading(false);
        }
    }, [displayKey, volume, initAudioContext, loadAudioBuffer, createSource]);

    // Stop function
    const stop = useCallback(() => {
        cleanupSource(currentSourceRef.current, currentGainRef.current);
        currentSourceRef.current = null;
        currentGainRef.current = null;
        setIsPlaying(false);
    }, [cleanupSource]);

    // Set volume function
    const setVolume = useCallback((newVolume: number) => {
        const clampedVolume = Math.max(0, Math.min(1, newVolume));
        setVolumeState(clampedVolume);

        if (masterGainRef.current) {
            masterGainRef.current.gain.value = clampedVolume;
        }
    }, []);

    // Handle key changes with cross-fade
    useEffect(() => {
        const newPadKey = getPadKey(displayKey);

        // If not playing or same key, do nothing
        if (!isPlaying || newPadKey === currentKeyRef.current) {
            return;
        }

        // Key changed while playing - cross-fade
        const performCrossfade = async () => {
            try {
                const ctx = audioContextRef.current;
                if (!ctx) return;

                const oldSource = currentSourceRef.current;
                const oldGain = currentGainRef.current;
                if (!oldSource || !oldGain) return;

                // Load new key's audio
                const newBuffer = await loadAudioBuffer(displayKey);
                const { source: newSource, gain: newGain } = createSource(newBuffer, 0);

                // Cross-fade
                const now = ctx.currentTime;

                // Fade out old
                oldGain.gain.setValueAtTime(oldGain.gain.value, now);
                oldGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION);

                // Fade in new
                newGain.gain.setValueAtTime(0, now);
                newGain.gain.linearRampToValueAtTime(volume, now + CROSSFADE_DURATION);

                // Update refs
                currentSourceRef.current = newSource;
                currentGainRef.current = newGain;
                currentKeyRef.current = newPadKey;

                // Clean up old source after fade
                setTimeout(() => {
                    cleanupSource(oldSource, oldGain);
                }, CROSSFADE_DURATION * 1000 + 100);

            } catch (error) {
                console.error('Failed to cross-fade worship pad:', error);
            }
        };

        performCrossfade();
    }, [displayKey, isPlaying, volume, loadAudioBuffer, createSource, cleanupSource]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupSource(currentSourceRef.current, currentGainRef.current);
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, [cleanupSource]);

    return {
        isPlaying,
        isLoading,
        volume,
        play,
        stop,
        setVolume,
    };
}
