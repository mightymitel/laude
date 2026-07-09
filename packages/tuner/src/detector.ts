/**
 * Microphone pitch detector: MediaStreamSource → highpass → lowpass →
 * AnalyserNode → pitchy (McLeod Pitch Method), sampled on a fixed interval
 * (NOT rAF — detection cadence is independent of rendering). The caller owns
 * getUserMedia; audio never leaves the device.
 *
 * Stability gates applied here per tick: volume (RMS floor) and clarity.
 * Median smoothing, note hysteresis and idle decay live in PitchStabilizer.
 */
import { PitchDetector as MpmDetector } from 'pitchy';
import { A4_DEFAULT_HZ, noteIndexOf, octaveOf } from './pitch-math';
import { PitchStabilizer } from './stabilizer';

export interface TunerReading {
  /** Detected pitch in Hz; null = idle (silence / no confident pitch). */
  hz: number | null;
  /** Fractional MIDI number of `hz`. */
  midi: number | null;
  /** Pitch class 0–11 (C = 0) of the locked note. */
  noteIndex: number | null;
  /** Scientific octave of the locked note (A4 → 4). */
  octave: number | null;
  /** Deviation from the locked note's center, clamped to ±50 cents. */
  cents: number | null;
  /** MPM clarity of the current frame, 0–1 (0 when below the volume gate). */
  clarity: number;
  /** Input RMS level, 0–1. */
  level: number;
}

export interface PitchDetectorOptions {
  /** Reference pitch for A4 in Hz. Default 440. */
  a4?: number;
  /** Detection cadence in ms. Default 50. */
  intervalMs?: number;
  /** Analyser fftSize (time-domain window). Default 2048. */
  fftSize?: number;
  /** Highpass cutoff to reject rumble/handling noise. Default 60 Hz. */
  highpassHz?: number;
  /** Lowpass cutoff to tame harmonics/hiss. Default 1500 Hz. */
  lowpassHz?: number;
  /** RMS floor below which no reading is taken. Default 0.01. */
  minRms?: number;
  /** MPM clarity below which no reading is taken. Default 0.9. */
  minClarity?: number;
  /** Held reading expires to idle after this long. Default 1000 ms. */
  idleAfterMs?: number;
  /** Note re-labels only when this far (cents) from the locked center. Default 60. */
  relabelCents?: number;
  /** Median window over accepted readings. Default 5. */
  medianWindow?: number;
}

export interface PitchDetectorHandle {
  /** Begin detecting on a live mic stream. The caller owns the stream's tracks. */
  start(stream: MediaStream): void;
  /** Stop detecting and release audio nodes. Does NOT stop the stream's tracks. */
  stop(): void;
  /** Readings arrive every intervalMs while started. Returns an unsubscribe. */
  subscribe(cb: (reading: TunerReading) => void): () => void;
}

const IDLE: Omit<TunerReading, 'level'> = {
  hz: null,
  midi: null,
  noteIndex: null,
  octave: null,
  cents: null,
  clarity: 0,
};

export function createPitchDetector(options: PitchDetectorOptions = {}): PitchDetectorHandle {
  const intervalMs = options.intervalMs ?? 50;
  const fftSize = options.fftSize ?? 2048;
  const highpassHz = options.highpassHz ?? 60;
  const lowpassHz = options.lowpassHz ?? 1500;
  const minRms = options.minRms ?? 0.01;
  const minClarity = options.minClarity ?? 0.9;
  const a4 = options.a4 ?? A4_DEFAULT_HZ;

  const subscribers = new Set<(reading: TunerReading) => void>();
  const stabilizer = new PitchStabilizer({
    a4,
    idleAfterMs: options.idleAfterMs,
    relabelCents: options.relabelCents,
    medianWindow: options.medianWindow,
  });

  let audioContext: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const buffer = new Float32Array(fftSize);
  const mpm = MpmDetector.forFloat32Array(fftSize);

  function emit(reading: TunerReading): void {
    for (const cb of subscribers) cb(reading);
  }

  function tick(): void {
    if (!analyser || !audioContext) return;
    analyser.getFloatTimeDomainData(buffer);

    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSquares / buffer.length);
    const level = Math.min(1, rms);
    const now = performance.now();

    let clarity = 0;
    let hz = 0;
    if (rms >= minRms) {
      [hz, clarity] = mpm.findPitch(buffer, audioContext.sampleRate);
    }

    const accepted = clarity >= minClarity && Number.isFinite(hz) && hz > 0;
    const stable = accepted ? stabilizer.accept(hz, now) : stabilizer.reject(now);

    if (stable === null) {
      emit({ ...IDLE, clarity, level });
      return;
    }
    emit({
      hz: stable.hz,
      midi: stable.midi,
      noteIndex: noteIndexOf(stable.lockedMidi),
      octave: octaveOf(stable.lockedMidi),
      cents: stable.cents,
      clarity,
      level,
    });
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    source?.disconnect();
    analyser?.disconnect();
    source = null;
    analyser = null;
    if (audioContext !== null) {
      audioContext.close().catch((err: unknown) => {
        console.error('Tuner: failed to close AudioContext', err);
      });
      audioContext = null;
    }
    stabilizer.reset();
  }

  return {
    start(stream: MediaStream): void {
      stop();
      const ctx = new AudioContext();
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = highpassHz;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = lowpassHz;
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = fftSize;

      const sourceNode = ctx.createMediaStreamSource(stream);
      sourceNode.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(analyserNode);

      audioContext = ctx;
      source = sourceNode;
      analyser = analyserNode;
      // Autoplay policy can leave a fresh context suspended; start() runs on a
      // user gesture (opening the tuner), so resuming is expected to succeed.
      ctx.resume().catch((err: unknown) => {
        console.error('Tuner: failed to resume AudioContext', err);
      });
      timer = setInterval(tick, intervalMs);
    },
    stop,
    subscribe(cb: (reading: TunerReading) => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
