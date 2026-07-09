/**
 * Pitch stabilizer — the pure state machine between raw accepted Hz readings
 * and what a tuner should display. Owns three of the stability mechanisms:
 *
 * - median-of-N smoothing over accepted readings (kills single-frame octave errors)
 * - note-name hysteresis (locked note re-labels only on a decisive move)
 * - decay to idle (a held value expires instead of freezing forever)
 *
 * Volume/clarity gating happens upstream (the caller decides accept vs reject).
 * Time is injected (`nowMs`) so all behavior is testable without timers.
 */
import { A4_DEFAULT_HZ, centsBetween, clampCents, hzToMidi, median } from './pitch-math';

export interface StabilizerOptions {
  /** Median window over accepted Hz readings. Default 5. */
  medianWindow?: number;
  /** Re-label the locked note only when the median is this far (cents) from its center. Default 60. */
  relabelCents?: number;
  /** With no accepted reading for this long, the held value expires to idle. Default 1000. */
  idleAfterMs?: number;
  /** Reference pitch for A4. Default 440. */
  a4?: number;
}

export interface StablePitch {
  /** Median Hz over the current window. */
  hz: number;
  /** Fractional MIDI of `hz`. */
  midi: number;
  /** Integer MIDI of the note the display is locked to. */
  lockedMidi: number;
  /** Deviation from the locked note's center, clamped to ±50 cents. */
  cents: number;
}

export class PitchStabilizer {
  private readonly medianWindow: number;
  private readonly relabelCents: number;
  private readonly idleAfterMs: number;
  private readonly a4: number;

  private window: number[] = [];
  private lockedMidi: number | null = null;
  private held: StablePitch | null = null;
  private lastAcceptedAtMs = 0;

  constructor(options: StabilizerOptions = {}) {
    this.medianWindow = options.medianWindow ?? 5;
    this.relabelCents = options.relabelCents ?? 60;
    this.idleAfterMs = options.idleAfterMs ?? 1000;
    this.a4 = options.a4 ?? A4_DEFAULT_HZ;
  }

  /** Feed one gate-passing Hz reading; returns the stabilized pitch to display. */
  accept(hz: number, nowMs: number): StablePitch {
    this.window.push(hz);
    if (this.window.length > this.medianWindow) this.window.shift();

    const medianHz = median(this.window);
    const midi = hzToMidi(medianHz, this.a4);

    if (
      this.lockedMidi === null ||
      Math.abs(centsBetween(midi, this.lockedMidi)) > this.relabelCents
    ) {
      this.lockedMidi = Math.round(midi);
    }

    const stable: StablePitch = {
      hz: medianHz,
      midi,
      lockedMidi: this.lockedMidi,
      cents: clampCents(centsBetween(midi, this.lockedMidi)),
    };
    this.held = stable;
    this.lastAcceptedAtMs = nowMs;
    return stable;
  }

  /**
   * No gate-passing reading this tick. Returns the held value while it is
   * fresh (< idleAfterMs old); afterwards resets and returns null (idle).
   */
  reject(nowMs: number): StablePitch | null {
    if (this.held !== null && nowMs - this.lastAcceptedAtMs < this.idleAfterMs) {
      return this.held;
    }
    this.reset();
    return null;
  }

  /** Drop all state: next accepted reading starts a fresh window and lock. */
  reset(): void {
    this.window = [];
    this.lockedMidi = null;
    this.held = null;
    this.lastAcceptedAtMs = 0;
  }
}
