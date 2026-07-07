/**
 * StemPlayer — the real-mode Web Audio graph:
 *   per stem: AudioBufferSourceNode → GainNode → AnalyserNode → master GainNode → destination.
 * Sources are one-shot, so play/seek/buffer swaps recreate them at the right
 * offset; the transport position derives from AudioContext.currentTime deltas
 * (rebased on every rate change so playbackRate math stays correct).
 */
import { ALL_STEMS, type StemName } from '@laude/song-model';
import type { StemBuffers } from './media';

export interface StemMix {
  /** Effective per-stem gain (fader × mute/solo), 0..1. */
  gains: Record<StemName, number>;
  master: number;
}

export class StemPlayer {
  private readonly stemGains = new Map<StemName, GainNode>();
  private readonly analysers = new Map<StemName, AnalyserNode>();
  private readonly masterGain: GainNode;
  private readonly buffers: StemBuffers = new Map();
  private readonly meterBins: Uint8Array<ArrayBuffer>;
  private sources: AudioBufferSourceNode[] = [];
  private playing = false;
  private baseOffset = 0;
  private startedAt = 0;
  private rate: number;

  constructor(
    private readonly ctx: AudioContext,
    buffers: StemBuffers,
    mix: StemMix,
    rate: number,
  ) {
    this.rate = rate;
    buffers.forEach((buffer, stem) => this.buffers.set(stem, buffer));
    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);
    for (const stem of ALL_STEMS) {
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      gain.connect(analyser);
      analyser.connect(this.masterGain);
      this.stemGains.set(stem, gain);
      this.analysers.set(stem, analyser);
    }
    this.meterBins = new Uint8Array(512);
    this.setMix(mix);
  }

  get duration(): number {
    let d = 0;
    this.buffers.forEach((b) => {
      d = Math.max(d, b.duration);
    });
    return d;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  position(): number {
    if (!this.playing) return this.baseOffset;
    return this.baseOffset + (this.ctx.currentTime - this.startedAt) * this.rate;
  }

  play(offset: number): void {
    this.stopSources();
    this.buffers.forEach((buffer, stem) => {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.rate;
      const gain = this.stemGains.get(stem);
      if (gain) source.connect(gain);
      source.start(0, Math.min(offset, buffer.duration));
      this.sources.push(source);
    });
    this.baseOffset = offset;
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  /** Stop sources and freeze the transport; returns the frozen position. */
  pause(): number {
    const pos = this.position();
    this.stopSources();
    this.playing = false;
    this.baseOffset = pos;
    return pos;
  }

  seek(offset: number): void {
    if (this.playing) this.play(offset);
    else this.baseOffset = offset;
  }

  setRate(rate: number): void {
    if (this.playing) {
      // Rebase so past playback keeps its old rate in the position math.
      this.baseOffset = this.position();
      this.startedAt = this.ctx.currentTime;
    }
    this.rate = rate;
    this.sources.forEach((s) => {
      s.playbackRate.value = rate;
    });
  }

  setMix(mix: StemMix): void {
    this.stemGains.forEach((gain, stem) => {
      gain.gain.value = mix.gains[stem];
    });
    this.masterGain.gain.value = mix.master;
  }

  /** Swap decoded buffers (key-variant change); playback resumes at the same position. */
  swapBuffers(replacements: StemBuffers): void {
    replacements.forEach((buffer, stem) => this.buffers.set(stem, buffer));
    if (this.playing) this.play(this.position());
  }

  /** Post-gain RMS per stem, mapped 0..1 for the mixer meters. */
  meters(): Record<StemName, number> {
    const out: Record<StemName, number> = { vocals: 0, bass: 0, drums: 0, other: 0 };
    this.analysers.forEach((analyser, stem) => {
      analyser.getByteTimeDomainData(this.meterBins);
      let sum = 0;
      for (let i = 0; i < this.meterBins.length; i += 1) {
        const v = (this.meterBins[i] - 128) / 128;
        sum += v * v;
      }
      out[stem] = Math.min(1, Math.sqrt(sum / this.meterBins.length) * 3);
    });
    return out;
  }

  dispose(): void {
    this.stopSources();
    this.playing = false;
    this.masterGain.disconnect();
  }

  private stopSources(): void {
    this.sources.forEach((s) => {
      s.stop();
      s.disconnect();
    });
    this.sources = [];
  }
}
