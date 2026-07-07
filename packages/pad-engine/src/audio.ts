/**
 * PadAudio — optional Web Audio backend behind the PadEngine state machine.
 *
 * One voice group per sounding chord: a detuned saw pair on the root (±6
 * cents) plus fifth/octave partials (style presets add sub-octave or upper
 * octaves and set the lowpass cutoff) → lowpass filter → group gain → master
 * gain (user volume) → destination. Chord/style changes crossfade two
 * overlapping groups (~800ms, matching the state machine's `crossfading`
 * window); start/stop fade ~500ms.
 *
 * SSR-safe: no globals touched — an AudioContext instance is handed in.
 */
import { parseChordRoot, rootFrequencyHz } from './chords';
import type { PadEngineState, PadStyle } from './index';

interface OscSpec {
  semitones: number;
  type: OscillatorType;
  level: number;
  detuneCents?: number;
}

interface StylePreset {
  cutoffHz: number;
  oscs: OscSpec[];
}

const ROOT_PAIR: OscSpec[] = [
  { semitones: 0, type: 'sawtooth', level: 0.5, detuneCents: -6 },
  { semitones: 0, type: 'sawtooth', level: 0.5, detuneCents: 6 },
];

const STYLE_PRESETS: Record<PadStyle, StylePreset> = {
  warm: {
    cutoffHz: 900,
    oscs: [
      ...ROOT_PAIR,
      { semitones: 7, type: 'sawtooth', level: 0.35 },
      { semitones: 12, type: 'sawtooth', level: 0.25 },
    ],
  },
  bright: {
    cutoffHz: 1400,
    oscs: [
      ...ROOT_PAIR,
      { semitones: 7, type: 'triangle', level: 0.5 },
      { semitones: 12, type: 'triangle', level: 0.4 },
    ],
  },
  shimmer: {
    cutoffHz: 1600,
    oscs: [
      ...ROOT_PAIR,
      { semitones: 7, type: 'triangle', level: 0.4 },
      { semitones: 19, type: 'triangle', level: 0.3 },
      { semitones: 24, type: 'triangle', level: 0.25 },
    ],
  },
  deep: {
    cutoffHz: 750,
    oscs: [
      { semitones: -12, type: 'sine', level: 0.6 },
      ...ROOT_PAIR,
      { semitones: 7, type: 'sawtooth', level: 0.3 },
    ],
  },
};

const CROSSFADE_S = 0.8;
const START_STOP_FADE_S = 0.5;
/** Keeps the summed saws well under clipping before the user volume gain. */
const VOICE_LEVEL = 0.25;

class Voice {
  private readonly oscillators: OscillatorNode[] = [];
  private readonly gain: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    rootPitchClass: number,
    style: PadStyle,
  ) {
    const preset = STYLE_PRESETS[style];
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = preset.cutoffHz;
    filter.Q.value = 0.7;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    filter.connect(this.gain);
    this.gain.connect(destination);
    const rootHz = rootFrequencyHz(rootPitchClass);
    for (const spec of preset.oscs) {
      const osc = ctx.createOscillator();
      osc.type = spec.type;
      osc.frequency.value = rootHz * Math.pow(2, spec.semitones / 12);
      osc.detune.value = spec.detuneCents ?? 0;
      const level = ctx.createGain();
      level.gain.value = spec.level * VOICE_LEVEL;
      osc.connect(level);
      level.connect(filter);
      osc.start();
      this.oscillators.push(osc);
    }
  }

  fadeIn(seconds: number): void {
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(1, now + seconds);
  }

  fadeOutAndStop(seconds: number): void {
    const now = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + seconds);
    const stopAt = now + seconds + 0.05;
    this.oscillators.forEach((osc) => osc.stop(stopAt));
  }
}

export class PadAudio {
  private readonly master: GainNode;
  private voice: Voice | null = null;
  /** What the current voice sounds like, to detect retunes/restyles. */
  private sounding: { chord: string; style: PadStyle } | null = null;

  constructor(private readonly ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);
  }

  /** Reconcile audio with the state machine (called by the engine on every change). */
  apply(state: PadEngineState): void {
    this.setVolume(state.volume);
    const target = state.running && state.chord !== null ? { chord: state.chord, style: state.style } : null;
    if (target === null) {
      this.silence(START_STOP_FADE_S);
      return;
    }
    if (this.sounding && this.sounding.chord === target.chord && this.sounding.style === target.style) {
      return;
    }
    const rootPc = parseChordRoot(target.chord);
    if (rootPc === null) return; // unparseable chord: keep whatever is sounding
    const fadeIn = this.voice ? CROSSFADE_S : START_STOP_FADE_S;
    this.voice?.fadeOutAndStop(CROSSFADE_S);
    this.voice = new Voice(this.ctx, this.master, rootPc, target.style);
    this.voice.fadeIn(fadeIn);
    this.sounding = target;
  }

  dispose(): void {
    this.silence(START_STOP_FADE_S);
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
  }

  private silence(fadeSeconds: number): void {
    if (!this.voice) return;
    this.voice.fadeOutAndStop(fadeSeconds);
    this.voice = null;
    this.sounding = null;
  }

  private setVolume(volume: number): void {
    if (this.master.gain.value === volume) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(volume, now + 0.05);
  }
}
