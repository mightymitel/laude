/**
 * Pure canvas drawing for the tuner gauge: an arc over ±50 cents with a ±5
 * cent in-tune band, a needle, and a subtle input-level bar. No React, no
 * state — the caller owns the rAF loop and easing.
 */

export interface GaugeColors {
    track: string;
    inTune: string;
    needle: string;
    text: string;
    muted: string;
}

export interface GaugeState {
    /** Eased cents deviation, ±50. */
    cents: number;
    /** 0 = idle (dim, centered), 1 = actively tracking a pitch. */
    presence: number;
    /** Eased input level, 0–1. */
    level: number;
    /** Whether the (eased) reading sits inside the in-tune band. */
    inTune: boolean;
}

const MAX_ANGLE = Math.PI / 4; // ±45° for ±50 cents
const BAND_CENTS = 5;

function angleFor(cents: number): number {
    return (Math.max(-50, Math.min(50, cents)) / 50) * MAX_ANGLE;
}

/** Point at `angle` (0 = straight up) and distance `r` from the pivot. */
function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
    return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

function arc(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    fromCents: number,
    toCents: number,
): void {
    const base = -Math.PI / 2; // canvas angle pointing up
    ctx.beginPath();
    ctx.arc(cx, cy, r, base + angleFor(fromCents), base + angleFor(toCents));
    ctx.stroke();
}

export function drawGauge(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    state: GaugeState,
    colors: GaugeColors,
): void {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.94;
    const r = Math.min(h * 0.8, w * 0.44);

    // Track arc with the in-tune band on top.
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = colors.track;
    arc(ctx, cx, cy, r, -50, 50);
    ctx.strokeStyle = colors.inTune;
    ctx.globalAlpha = state.inTune ? 0.95 : 0.35;
    arc(ctx, cx, cy, r, -BAND_CENTS, BAND_CENTS);
    ctx.globalAlpha = 1;

    // Ticks every 10 cents; labels at the extremes and center.
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.5;
    for (let c = -50; c <= 50; c += 10) {
        const a = angleFor(c);
        const inner = c === 0 ? r - 14 : r - 8;
        const [x1, y1] = polar(cx, cy, inner, a);
        const [x2, y2] = polar(cx, cy, r - 2, a);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    ctx.fillStyle = colors.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const [c, label] of [[-50, '-50'], [0, '0'], [50, '+50']] as const) {
        const [x, y] = polar(cx, cy, r + 14, angleFor(c));
        ctx.fillText(label, x, y + 4);
    }

    // Needle: dims toward idle, settles green when in tune.
    const needleAngle = angleFor(state.cents);
    ctx.globalAlpha = 0.2 + 0.8 * state.presence;
    ctx.strokeStyle = state.inTune ? colors.inTune : colors.needle;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const [nx, ny] = polar(cx, cy, r - 18, needleAngle);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = state.inTune ? colors.inTune : colors.needle;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Subtle input level bar along the bottom edge.
    const barW = w * 0.26;
    const barY = h - 3;
    ctx.strokeStyle = colors.muted;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(cx - barW / 2, barY);
    ctx.lineTo(cx + barW / 2, barY);
    ctx.stroke();
    ctx.globalAlpha = 0.7;
    const fill = Math.min(1, Math.sqrt(state.level) * 2); // perceptual-ish scale
    if (fill > 0.01) {
        ctx.beginPath();
        ctx.moveTo(cx - barW / 2, barY);
        ctx.lineTo(cx - barW / 2 + barW * fill, barY);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}
