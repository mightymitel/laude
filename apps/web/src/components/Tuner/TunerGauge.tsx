/**
 * Canvas gauge, rendered at rAF and fully decoupled from detection: each frame
 * the displayed value eases toward the latest reading (in `readingRef`), so
 * the needle glides instead of jumping at detection rate. Idle eases the
 * needle back to center and dims it.
 */
import { useEffect, useRef, type RefObject } from 'react';
import type { TunerReading } from '@laude/tuner';
import { drawGauge, type GaugeColors } from './gaugeDraw';
import { modeCents, type TuningMode } from './useTuner';
import styles from './Tuner.module.css';

interface TunerGaugeProps {
    readingRef: RefObject<TunerReading>;
    mode: TuningMode;
    compact: boolean;
}

const CENTS_EASE = 0.15;
const PRESENCE_EASE = 0.08;
const LEVEL_EASE = 0.25;
const IN_TUNE_CENTS = 5;

function readColors(el: HTMLElement): GaugeColors {
    const css = getComputedStyle(el);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return {
        track: v('--border', '#888'),
        inTune: v('--success', '#10b981'),
        needle: v('--text-primary', 'currentColor'),
        text: v('--text-primary', 'currentColor'),
        muted: v('--text-muted', '#999'),
    };
}

export function TunerGauge({ readingRef, mode, compact }: TunerGaugeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const centsLabelRef = useRef<HTMLDivElement>(null);
    const modeRef = useRef<TuningMode>(mode);
    modeRef.current = mode;

    const width = compact ? 320 : 420;
    const height = compact ? 170 : 220;

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        let cents = 0;
        let presence = 0;
        let level = 0;
        let raf = 0;

        const frame = () => {
            raf = requestAnimationFrame(frame);
            const reading = readingRef.current;
            const targetCents = modeCents(reading, modeRef.current);
            cents += ((targetCents ?? 0) - cents) * CENTS_EASE;
            presence += ((targetCents === null ? 0 : 1) - presence) * PRESENCE_EASE;
            level += (reading.level - level) * LEVEL_EASE;

            const inTune = targetCents !== null && Math.abs(cents) <= IN_TUNE_CENTS;
            drawGauge(ctx, width, height, { cents, presence, level, inTune }, readColors(canvas));

            const label = centsLabelRef.current;
            if (label) {
                const rounded = Math.round(cents);
                label.textContent =
                    presence < 0.3 ? '–' : `${rounded > 0 ? '+' : ''}${rounded} cents`;
            }
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [readingRef, width, height]);

    return (
        <div className={styles.gauge}>
            <canvas
                ref={canvasRef}
                className={styles.canvas}
                // Attribute size is set (DPR-scaled) in the effect; keep layout size here.
                style={{ maxWidth: width, aspectRatio: `${width} / ${height}` }}
            />
            <div ref={centsLabelRef} className={styles.centsLabel}>
                –
            </div>
        </div>
    );
}
