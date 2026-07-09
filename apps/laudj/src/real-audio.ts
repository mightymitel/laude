/**
 * RealAudio — one loaded performance's decoded stems + beatgrid + StemPlayer.
 * Created via RealAudio.load(), which rejects when the LaudStudio service has
 * no decodable audio for the performance — the engine then falls back to
 * simulated playback. Owns the key-variant buffer cache; the StemPlayer graph
 * is built lazily on the shared AudioContext at the first play.
 */
import type { StemName } from '@laude/song-model';
import { getAudioContext } from './audio-context';
import { StemPlayer, type StemMix } from './audio-graph';
import {
  PITCHED_STEMS,
  loadBeatgrid,
  loadStemBuffers,
  loadVariantBuffer,
  type StemBuffers,
} from './media';

export class RealAudio {
  private player: StemPlayer | null = null;
  /** Buffers reflecting the current key variant (the player is built from these). */
  private readonly activeBuffers: StemBuffers;
  private readonly variantCache = new Map<string, AudioBuffer>();

  private constructor(
    private readonly performanceId: string,
    /** Pristine variant-0 buffers, so returning to the original key needs no refetch. */
    private readonly baseBuffers: StemBuffers,
    /** Beat onsets (performance-relative seconds); null → countdown-quantize fallback. */
    readonly beats: number[] | null,
  ) {
    this.activeBuffers = new Map(baseBuffers);
  }

  /** Fetch + decode all four stems (and the beatgrid); rejects when not real audio. */
  static async load(performanceId: string): Promise<RealAudio> {
    const beatsPromise = loadBeatgrid(performanceId); // resolves null on failure (warned inside)
    const buffers = await loadStemBuffers(performanceId);
    return new RealAudio(performanceId, buffers, await beatsPromise);
  }

  get duration(): number {
    let d = 0;
    this.activeBuffers.forEach((b) => {
      d = Math.max(d, b.duration);
    });
    return d;
  }

  isPlaying(): boolean {
    return this.player?.isPlaying() ?? false;
  }

  position(): number | null {
    return this.player ? this.player.position() : null;
  }

  /** (Re)start playback at `offset`, building the graph on first use. */
  play(offset: number, mix: StemMix, rate: number): void {
    if (!this.player) {
      this.player = new StemPlayer(getAudioContext(), this.activeBuffers, mix, rate);
    }
    this.player.play(offset);
  }

  /** Freeze playback; returns the frozen position (null when nothing was live). */
  pause(): number | null {
    return this.player?.isPlaying() ? this.player.pause() : null;
  }

  seek(offset: number): void {
    this.player?.seek(offset);
  }

  setMix(mix: StemMix): void {
    this.player?.setMix(mix);
  }

  setRate(rate: number): void {
    this.player?.setRate(rate);
  }

  meters(): Record<StemName, number> | null {
    return this.player ? this.player.meters() : null;
  }

  /**
   * Fetch + decode the pitched stems for a variant (0 = pristine originals),
   * cached per (stem, semitones). Split from applyVariant so the engine can
   * drop stale results after the await.
   */
  async fetchVariant(semitones: number): Promise<StemBuffers> {
    const out: StemBuffers = new Map();
    if (semitones === 0) {
      PITCHED_STEMS.forEach((stem) => {
        const buffer = this.baseBuffers.get(stem);
        if (buffer) out.set(stem, buffer);
      });
      return out;
    }
    const entries = await Promise.all(
      PITCHED_STEMS.map(async (stem): Promise<[StemName, AudioBuffer]> => {
        const key = `${stem}:${semitones}`;
        const cached = this.variantCache.get(key);
        if (cached) return [stem, cached];
        const buffer = await loadVariantBuffer(this.performanceId, stem, semitones);
        this.variantCache.set(key, buffer);
        return [stem, buffer];
      }),
    );
    entries.forEach(([stem, buffer]) => out.set(stem, buffer));
    return out;
  }

  /** Swap pitched stems in place (drums untouched); playback keeps its position. */
  applyVariant(replacements: StemBuffers): void {
    replacements.forEach((buffer, stem) => this.activeBuffers.set(stem, buffer));
    this.player?.swapBuffers(replacements);
  }

  dispose(): void {
    this.player?.dispose();
    this.player = null;
  }
}
