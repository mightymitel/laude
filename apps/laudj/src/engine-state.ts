/**
 * Observable EngineState store + tiny state math for LaudjEngine, ported from
 * the protocol's MockEngine so the simulated fallback behaves identically.
 */
import type { EngineState, StemChannelState, TransportState } from '@laude/laudj-control-protocol';
import { ALL_STEMS, type StemName } from '@laude/song-model';

export const INITIAL_TRANSPORT: TransportState = {
  playing: false,
  position_s: 0,
  duration_s: 0,
  song_id: null,
  song_title: null,
  sections: [],
  current_section: 0,
  queued_section: null,
  key: null,
  key_variant: 0,
  tempo_pct: 100,
};

export function initialEngineState(): EngineState {
  return {
    mode: 'full_engine',
    auto_advance: true,
    yielded: false,
    transport: { ...INITIAL_TRANSPORT },
    stems: ALL_STEMS.map((stem) => ({ stem, gain: 0.8, muted: false, soloed: false, meter: 0 })),
    master: 0.85,
    transition: { type: 'quantized', crossfade_s: 2 },
    pads: { running: false, style: 'warm', volume: 0.5, interlude: false, chord: null },
    session_connected: false,
  };
}

/** Deep-cloning snapshot/patch/subscribe base (same emit semantics as the MockEngine). */
export abstract class EngineStateStore {
  protected state: EngineState = initialEngineState();
  private listeners = new Set<(state: EngineState) => void>();

  subscribe(listener: (state: EngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  protected patch(partial: Partial<EngineState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  protected patchTransport(partial: Partial<TransportState>): void {
    this.state = { ...this.state, transport: { ...this.state.transport, ...partial } };
    this.emit();
  }

  protected patchStem(stem: StemName, partial: Partial<StemChannelState>): void {
    this.state = {
      ...this.state,
      stems: this.state.stems.map((s) => (s.stem === stem ? { ...s, ...partial } : s)),
    };
    this.emit();
  }

  protected emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((l) => l(snapshot));
  }

  /** Deep clone (like the MockEngine) so listeners never see internal mutation. */
  private snapshot(): EngineState {
    return structuredClone(this.state);
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function currentSectionAt(sections: { start_s: number }[], pos: number): number {
  let idx = 0;
  sections.forEach((s, i) => {
    if (pos >= s.start_s) idx = i;
  });
  return idx;
}

/** Mock-style animated meter wave for simulated playback. */
export function simulatedMeter(index: number, gain: number, master: number): number {
  const time = Date.now() / 1000;
  const wave = 0.4 + 0.3 * Math.sin(time * (1.3 + index * 0.7)) + 0.2 * Math.sin(time * 5.1 + index);
  return clamp(wave * gain * master, 0, 1);
}

/** One tick of transport advance: real ctx-derived position when given, else dt·tempo. */
export function advanceTransport(t: TransportState, realPos: number | null, dt: number): TransportState {
  const pos = Math.min(t.duration_s, realPos ?? t.position_s + dt * (t.tempo_pct / 100));
  return {
    ...t,
    position_s: pos,
    current_section: currentSectionAt(t.sections, pos),
    playing: pos < t.duration_s,
  };
}

/** Meter update for one tick: analyser RMS in real mode, animated wave otherwise. */
export function meteredStems(state: EngineState, real: Record<StemName, number> | null): EngineState['stems'] {
  const anySolo = state.stems.some((s) => s.soloed);
  return state.stems.map((s, i) => {
    const audible = state.transport.playing && !s.muted && (!anySolo || s.soloed);
    if (!audible) return { ...s, meter: 0 };
    return { ...s, meter: real ? real[s.stem] : simulatedMeter(i, s.gain, state.master) };
  });
}
