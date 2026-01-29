import { useEffect, useRef, useState } from 'react';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import styles from './Tuner.module.css';

interface TunerProps {
    mode?: 'full' | 'mini';
}

export function Tuner({ mode = 'full' }: TunerProps) {
    const [active, setActive] = useState(false);
    const { note, cents, frequency, isListening, error, analyser } = useAudioAnalyzer(active);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        // Determine if we should visualize
        if (!isListening || !analyser || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!active) return; // Stop if not active
            rafRef.current = requestAnimationFrame(draw);

            analyser.getByteTimeDomainData(dataArray);

            ctx.fillStyle = '#1e1e1e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Waveform
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#3b82f6'; // Primary color
            ctx.beginPath();

            const sliceWidth = canvas.width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * canvas.height / 2;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();

            // Draw Needle/Gauge if mode is full or even mini
            // Determine offset from center based on cents
            // Range: -50 to +50 cents usually shown
            const centerX = canvas.width / 2;
            // Map cents (-50 to 50) to angle (-45deg to 45deg)
            // Cents can be outside -50/50, clamp it
            const clampedCents = Math.max(-50, Math.min(50, cents));
            const angle = (clampedCents / 50) * (Math.PI / 4); // +/- 45 degrees

            const needleLen = canvas.height * 0.8;

            ctx.save();
            ctx.translate(centerX, canvas.height); // Pivot at bottom center
            ctx.rotate(angle);

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -needleLen);
            ctx.lineWidth = 4;
            ctx.strokeStyle = Math.abs(cents) < 5 ? '#22c55e' : '#ef4444'; // Green if in tune, else red
            ctx.stroke();

            // Needle head
            ctx.beginPath();
            ctx.arc(0, -needleLen, 4, 0, 2 * Math.PI);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fill();

            ctx.restore();
        };

        // Start visualization loop
        draw();
    }, [isListening, analyser, active, cents]);

    const toggleTuner = () => {
        setActive(!active);
    };

    // Auto-start in full mode? Maybe let user click start for permission reasons first time
    // But if reusing component, explicit start is better.

    return (
        <div className={`${styles.tunerContainer} ${styles[mode]}`}>
            {mode === 'full' && <h1>Guitar Tuner</h1>}

            <div className={styles.display}>
                {error ? (
                    <div className={styles.error}>{error}</div>
                ) : (
                    <>
                        <div className={styles.noteDisplay}>{note}</div>
                        <div className={styles.frequency}>{frequency.toFixed(1)} Hz</div>
                        <div className={`${styles.cents} ${Math.abs(cents) < 5 ? styles.inTune : cents < 0 ? styles.flat : styles.sharp}`}>
                            {isListening ? (cents > 0 ? `+${cents}` : cents) : 'Off'}
                        </div>
                    </>
                )}

                <canvas
                    ref={canvasRef}
                    className={styles.canvas}
                    width={mode === 'mini' ? 300 : 600}
                    height={mode === 'mini' ? 100 : 200}
                />
            </div>

            <div className={styles.controls}>
                <button className={styles.startButton} onClick={toggleTuner}>
                    {isListening ? 'Stop' : 'Start Tuner'}
                </button>
            </div>
        </div>
    );
}
