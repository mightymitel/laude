/**
 * @laude/pad-engine — STUB for the wireframe PoC.
 * No Web Audio: a state machine + change events so UIs can wireframe pad
 * controls. The real engine is one polyphonic instrument fed a key/chord
 * stream (feed a key → drone; feed a progression → interlude), with style
 * presets and key-change crossfades.
 */

export const PAD_STYLES = ['warm', 'bright', 'shimmer', 'deep'] as const;
export type PadStyle = (typeof PAD_STYLES)[number];

export interface PadEngineState {
  running: boolean;
  key: string | null;
  style: PadStyle;
  volume: number; // 0..1
  mode: 'drone' | 'interlude';
  /** Chord currently sounding (interlude mode advances through a progression). */
  chord: string | null;
  /** True briefly during key-change crossfades (stubbed with a timer). */
  crossfading: boolean;
}

type Listener = (state: PadEngineState) => void;

export class PadEngine {
  private state: PadEngineState = {
    running: false,
    key: null,
    style: 'warm',
    volume: 0.5,
    mode: 'drone',
    chord: null,
    crossfading: false,
  };
  private listeners = new Set<Listener>();
  private interludeTimer: ReturnType<typeof setInterval> | null = null;
  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;

  getState(): PadEngineState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.patch({ running: true, mode: 'drone', chord: this.state.key });
  }

  stop(): void {
    this.stopInterlude();
    this.patch({ running: false, chord: null });
  }

  /** Feed the session key → drone follows, with a stubbed crossfade. */
  setKey(key: string | null): void {
    if (key === this.state.key) return;
    if (this.crossfadeTimer) clearTimeout(this.crossfadeTimer);
    this.patch({ key, crossfading: this.state.running, chord: this.state.mode === 'drone' ? key : this.state.chord });
    this.crossfadeTimer = setTimeout(() => this.patch({ crossfading: false }), 800);
  }

  setStyle(style: PadStyle): void {
    this.patch({ style });
  }

  setVolume(volume: number): void {
    this.patch({ volume: Math.min(1, Math.max(0, volume)) });
  }

  /** Feed a progression → interlude: steps through chords on a timer (stub). */
  startInterlude(progression: string[], stepMs = 2000): void {
    this.stopInterlude();
    if (progression.length === 0) return;
    let i = 0;
    this.patch({ running: true, mode: 'interlude', chord: progression[0] });
    this.interludeTimer = setInterval(() => {
      i = (i + 1) % progression.length;
      this.patch({ chord: progression[i] });
    }, stepMs);
  }

  stopInterlude(): void {
    if (this.interludeTimer) {
      clearInterval(this.interludeTimer);
      this.interludeTimer = null;
    }
    if (this.state.mode === 'interlude') {
      this.patch({ mode: 'drone', chord: this.state.key });
    }
  }

  private patch(partial: Partial<PadEngineState>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();
    this.listeners.forEach((l) => l(snapshot));
  }
}

/** Default interlude progression per key (I–V–vi–IV), canonical English symbols. */
export function defaultInterlude(key: string): string[] {
  // Wireframe-grade: a tiny lookup for common keys; falls back to the key alone.
  const table: Record<string, string[]> = {
    C: ['C', 'G', 'Am', 'F'],
    D: ['D', 'A', 'Bm', 'G'],
    E: ['E', 'B', 'C#m', 'A'],
    F: ['F', 'C', 'Dm', 'Bb'],
    G: ['G', 'D', 'Em', 'C'],
    A: ['A', 'E', 'F#m', 'D'],
    Em: ['Em', 'C', 'G', 'D'],
    Am: ['Am', 'F', 'C', 'G'],
    Bm: ['Bm', 'G', 'D', 'A'],
  };
  return table[key] ?? [key];
}
