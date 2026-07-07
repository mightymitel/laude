/**
 * QuantizedLauncher — schedules queued section launches. With a beatgrid the
 * launch fires on the next beat after the current position (setTimeout scaled
 * by tempo); without one, the engine tick drives the mock-style 2s countdown
 * via tickFallback().
 */
import { nextBeatAfter } from './beats';

export interface QuantizeDeps {
  /** Live transport facts at scheduling time. */
  read(): {
    queuedSection: number | null;
    playing: boolean;
    positionS: number;
    tempoPct: number;
    beats: number[] | null;
  };
  /** Perform the queued jump (seek + state patch). */
  fire(): void;
}

export class QuantizedLauncher {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private countdown = 0;

  constructor(private readonly deps: QuantizeDeps) {}

  /** True while a beat-timer is armed (the tick countdown must stay idle). */
  get beatTimerPending(): boolean {
    return this.timer !== null;
  }

  /** (Re)arm from current facts; call after queue/play/seek/tempo changes. */
  schedule(): void {
    this.clear();
    const t = this.deps.read();
    if (t.queuedSection === null || !t.playing) return;
    if (t.beats) {
      const beat = nextBeatAfter(t.beats, t.positionS);
      if (beat !== null) {
        const waitMs = Math.max(0, ((beat - t.positionS) / (t.tempoPct / 100)) * 1000);
        this.timer = setTimeout(() => {
          this.timer = null;
          this.deps.fire();
        }, waitMs);
      }
    }
    // No beatgrid → tickFallback's 2s countdown (mock behavior) fires it.
  }

  /** Drive the no-beatgrid countdown from the engine tick (only while playing). */
  tickFallback(dt: number, queuedSection: number | null): void {
    if (queuedSection === null || this.timer !== null) return;
    this.countdown += dt;
    if (this.countdown >= 2) {
      this.countdown = 0;
      this.deps.fire();
    }
  }

  /** Cancel any armed timer and reset the countdown (pause/load/immediate launch). */
  clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.countdown = 0;
  }
}
