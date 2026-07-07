/**
 * LaudjEngine — EngineConnection implementation with real Web Audio playback.
 *
 * Observable behavior matches the protocol's MockEngine (state shape, ~10Hz
 * updates, yield rule), but `load_song` fetches + decodes the performance's
 * real stems when the pipeline rendered them; any failure (mock-seeded
 * placeholder files, missing storage) falls back to the mock-style simulated
 * transport/meters for that song. The AudioContext is created/resumed lazily
 * on the first audible gesture (play / pad_start / immediate launch).
 */
import type { EngineCommand, EngineConnection } from '@laude/laudj-control-protocol';
import { ALL_STEMS, type StemName } from '@laude/song-model';
import { getAudioContext } from './audio-context';
import type { StemMix } from './audio-graph';
import { clampToVariants } from './beats';
import { EngineStateStore, advanceTransport, clamp, meteredStems } from './engine-state';
import { QuantizedLauncher } from './quantize';
import { RealAudio } from './real-audio';

export interface EnginePerformance {
  id: string;
  stems: StemName[];
  key_variants: number[];
}

export interface EngineSong {
  song_id: string;
  title: string;
  key: string;
  duration_s: number;
  sections: { label: string; start_s: number }[];
  /** Present when the extraction pipeline rendered real stems for a performance. */
  performance?: EnginePerformance;
}

export interface LaudjEngineOptions {
  /** Called with the shared AudioContext on every audible user gesture. */
  onAudioContext?: (ctx: AudioContext) => void;
}

export class LaudjEngine extends EngineStateStore implements EngineConnection {
  readonly connected = true;

  private readonly ticker: ReturnType<typeof setInterval>;
  private songs = new Map<string, EngineSong>();

  /** Set once the loaded song's stems decoded; null → loading or simulated. */
  private real: RealAudio | null = null;
  private loadToken = 0;
  private readonly launcher = new QuantizedLauncher({
    read: () => ({
      queuedSection: this.state.transport.queued_section,
      playing: this.state.transport.playing,
      positionS: this.real?.position() ?? this.state.transport.position_s,
      tempoPct: this.state.transport.tempo_pct,
      beats: this.real?.beats ?? null,
    }),
    fire: () => this.fireQueuedLaunch(),
  });

  constructor(private readonly options: LaudjEngineOptions = {}) {
    super();
    this.ticker = setInterval(() => this.tick(0.1), 100);
  }

  dispose(): void {
    clearInterval(this.ticker);
    this.launcher.clear();
    this.real?.dispose();
  }

  registerSong(song: EngineSong): void {
    this.songs.set(song.song_id, song);
  }

  /** Session-follow hook: an external presenter changed state → yield rule. */
  externalPresenterActed(): void {
    if (this.state.auto_advance) this.patch({ yielded: true });
  }

  setSessionConnected(connected: boolean): void {
    this.patch({ session_connected: connected });
  }

  send(command: EngineCommand): void {
    switch (command.type) {
      case 'play':
        this.handlePlay();
        break;
      case 'pause':
        this.handlePause();
        break;
      case 'seek':
        this.handleSeek(command.position_s);
        break;
      case 'load_song':
        this.handleLoadSong(command.song_id);
        break;
      case 'launch_section':
        this.handleLaunchSection(command.index);
        break;
      case 'set_stem_gain':
        this.patchStem(command.stem, { gain: clamp(command.gain, 0, 1) });
        this.real?.setMix(this.currentMix());
        break;
      case 'set_stem_muted':
        this.patchStem(command.stem, { muted: command.muted });
        this.real?.setMix(this.currentMix());
        break;
      case 'set_stem_soloed':
        this.patchStem(command.stem, { soloed: command.soloed });
        this.real?.setMix(this.currentMix());
        break;
      case 'set_master':
        this.patch({ master: clamp(command.gain, 0, 1) });
        this.real?.setMix(this.currentMix());
        break;
      case 'set_transition':
        this.patch({
          transition: {
            type: command.transition,
            crossfade_s: command.crossfade_s ?? this.state.transition.crossfade_s,
          },
        });
        break;
      case 'set_key_variant':
        this.handleKeyVariant(command.semitones);
        break;
      case 'set_tempo_pct':
        this.handleTempo(command.tempo_pct);
        break;
      case 'set_mode':
        this.patch({ mode: command.mode });
        break;
      case 'set_auto_advance':
        this.patch({ auto_advance: command.enabled, yielded: false });
        break;
      case 'resume_auto_advance':
        this.patch({ yielded: false });
        break;
      case 'pad_start':
        this.gesture();
        this.patch({ pads: { ...this.state.pads, running: true, chord: this.state.transport.key } });
        break;
      case 'pad_stop':
        this.patch({ pads: { ...this.state.pads, running: false, interlude: false, chord: null } });
        break;
      case 'pad_set_style':
        this.patch({ pads: { ...this.state.pads, style: command.style } });
        break;
      case 'pad_set_volume':
        this.patch({ pads: { ...this.state.pads, volume: clamp(command.volume, 0, 1) } });
        break;
      case 'pad_interlude':
        this.patch({ pads: { ...this.state.pads, interlude: command.on } });
        break;
    }
  }

  // --- command handlers -------------------------------------------------------

  private handlePlay(): void {
    this.gesture();
    this.real?.play(
      this.state.transport.position_s,
      this.currentMix(),
      this.state.transport.tempo_pct / 100,
    );
    this.patchTransport({ playing: true });
    this.launcher.schedule();
  }

  private handlePause(): void {
    this.launcher.clear(); // queued_section survives; rescheduled on the next play
    const frozen = this.real?.pause() ?? null;
    if (frozen !== null) this.patchTransport({ playing: false, position_s: frozen });
    else this.patchTransport({ playing: false });
  }

  private handleSeek(position: number): void {
    const pos = clamp(position, 0, this.state.transport.duration_s);
    this.real?.seek(pos);
    this.patchTransport({ position_s: pos });
    if (this.launcher.beatTimerPending) this.launcher.schedule();
  }

  private handleLoadSong(songId: string): void {
    const song = this.songs.get(songId);
    if (!song) return;
    this.loadToken += 1;
    this.launcher.clear();
    this.real?.dispose();
    this.real = null;
    this.patchTransport({
      song_id: song.song_id,
      song_title: song.title,
      duration_s: song.duration_s,
      sections: song.sections,
      position_s: 0,
      current_section: 0,
      queued_section: null,
      key: song.key,
      key_variant: 0,
      playing: false,
    });
    const perf = song.performance;
    if (perf && ALL_STEMS.every((stem) => perf.stems.includes(stem))) {
      void this.loadRealAudio(song.song_id, perf.id, this.loadToken);
    }
  }

  private async loadRealAudio(songId: string, perfId: string, token: number): Promise<void> {
    let real: RealAudio;
    try {
      real = await RealAudio.load(songId, perfId);
    } catch (err) {
      if (token === this.loadToken) {
        console.warn(`LauDJ: stems for "${songId}" are not playable audio — simulated playback`, err);
      }
      return;
    }
    if (token !== this.loadToken) {
      real.dispose();
      return;
    }
    this.real = real;
    const duration = real.duration;
    if (duration > 0) this.patchTransport({ duration_s: duration });
    // Operator already hit play while decoding → switch over at the live position.
    if (this.state.transport.playing) {
      real.play(
        Math.min(this.state.transport.position_s, duration),
        this.currentMix(),
        this.state.transport.tempo_pct / 100,
      );
      this.launcher.schedule();
    }
  }

  private handleLaunchSection(index: number): void {
    const section = this.state.transport.sections[index];
    if (!section) return;
    if (this.state.transition.type === 'immediate') {
      this.gesture();
      this.launcher.clear();
      this.real?.play(section.start_s, this.currentMix(), this.state.transport.tempo_pct / 100);
      this.patchTransport({
        current_section: index,
        position_s: section.start_s,
        playing: true,
        queued_section: null,
      });
    } else {
      this.patchTransport({ queued_section: index });
      this.launcher.schedule();
    }
  }

  private handleKeyVariant(semitones: number): void {
    const t = this.state.transport;
    const song = t.song_id !== null ? this.songs.get(t.song_id) : undefined;
    const real = this.real;
    if (real && song?.performance) {
      const next = clampToVariants(semitones, song.performance.key_variants);
      if (next === t.key_variant) return;
      const previous = t.key_variant;
      this.patchTransport({ key_variant: next });
      void this.applyKeyVariant(real, next, previous);
    } else {
      this.patchTransport({ key_variant: clamp(semitones, -6, 6) });
    }
  }

  private async applyKeyVariant(real: RealAudio, semitones: number, previous: number): Promise<void> {
    const stale = () => this.real !== real || this.state.transport.key_variant !== semitones;
    try {
      const replacements = await real.fetchVariant(semitones);
      if (stale()) return;
      real.applyVariant(replacements); // drums untouched: always the original
    } catch (err) {
      console.warn(`LauDJ: key variant ${semitones} unavailable — staying on ${previous}`, err);
      if (!stale()) this.patchTransport({ key_variant: previous });
    }
  }

  private handleTempo(tempoPct: number): void {
    const pct = clamp(tempoPct, 75, 125);
    this.patchTransport({ tempo_pct: pct });
    this.real?.setRate(pct / 100);
    if (this.launcher.beatTimerPending) this.launcher.schedule();
  }

  // --- shared plumbing ----------------------------------------------------------

  /** Create/resume the shared AudioContext inside a user-gesture command. */
  private gesture(): void {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch((err: unknown) => {
        console.warn('LauDJ: AudioContext resume failed', err);
      });
    }
    this.options.onAudioContext?.(ctx);
  }

  private currentMix(): StemMix {
    const anySolo = this.state.stems.some((s) => s.soloed);
    const gains: Record<StemName, number> = { vocals: 0, bass: 0, drums: 0, other: 0 };
    this.state.stems.forEach((s) => {
      const audible = !s.muted && (!anySolo || s.soloed);
      gains[s.stem] = audible ? s.gain : 0;
    });
    return { gains, master: this.state.master };
  }

  // --- quantized section launches -------------------------------------------------

  private fireQueuedLaunch(): void {
    const t = this.state.transport;
    if (t.queued_section === null) return;
    const section = t.sections[t.queued_section];
    if (!section) {
      this.patchTransport({ queued_section: null });
      return;
    }
    if (t.playing) this.real?.seek(section.start_s);
    this.patchTransport({
      position_s: section.start_s,
      current_section: t.queued_section,
      queued_section: null,
    });
  }

  // --- 10 Hz tick -------------------------------------------------------------------

  private tick(dt: number): void {
    const t = this.state.transport;
    if (t.playing && t.duration_s > 0) {
      const realPos = this.real?.isPlaying() === true ? this.real.position() : null;
      const advanced = advanceTransport(t, realPos, dt);
      if (!advanced.playing) this.real?.pause(); // reached the end
      this.state = { ...this.state, transport: advanced };
      this.launcher.tickFallback(dt, advanced.queued_section);
    }
    this.state = {
      ...this.state,
      stems: meteredStems(this.state, this.real ? this.real.meters() : null),
    };
    this.emit();
  }
}
