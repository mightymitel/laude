/**
 * MockEngine — in-process stand-in for the native Rust engine (STUB).
 * Implements the full EngineConnection contract: commands mutate state,
 * meters animate, transport advances on a timer, quantized launches land on
 * the next "bar". Lets the whole panel be clickable with zero native code.
 */
import { ALL_STEMS } from '@laude/song-model';
import type {
  EngineCommand,
  EngineConnection,
  EngineState,
  TransportState,
} from './index';

export interface MockSong {
  song_id: string;
  title: string;
  key: string;
  duration_s: number;
  sections: { label: string; start_s: number }[];
}

const initialTransport: TransportState = {
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

export class MockEngine implements EngineConnection {
  readonly connected = true;

  private state: EngineState = {
    mode: 'full_engine',
    auto_advance: true,
    yielded: false,
    transport: { ...initialTransport },
    stems: ALL_STEMS.map((stem) => ({ stem, gain: 0.8, muted: false, soloed: false, meter: 0 })),
    master: 0.85,
    transition: { type: 'quantized', crossfade_s: 2 },
    pads: { running: false, style: 'warm', volume: 0.5, interlude: false, chord: null },
    session_connected: false,
  };

  private listeners = new Set<(state: EngineState) => void>();
  private ticker: ReturnType<typeof setInterval>;
  private songs = new Map<string, MockSong>();

  constructor(songs: MockSong[] = []) {
    songs.forEach((s) => this.songs.set(s.song_id, s));
    // 10 Hz tick: advance transport, animate meters, fire queued sections.
    this.ticker = setInterval(() => this.tick(0.1), 100);
  }

  dispose(): void {
    clearInterval(this.ticker);
  }

  registerSong(song: MockSong): void {
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
    const t = this.state.transport;
    switch (command.type) {
      case 'play':
        this.patchTransport({ playing: true });
        break;
      case 'pause':
        this.patchTransport({ playing: false });
        break;
      case 'seek':
        this.patchTransport({ position_s: clamp(command.position_s, 0, t.duration_s) });
        break;
      case 'load_song': {
        const song = this.songs.get(command.song_id);
        if (!song) break;
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
        break;
      }
      case 'launch_section': {
        if (this.state.transition.type === 'immediate') {
          const section = t.sections[command.index];
          if (section) {
            this.patchTransport({ current_section: command.index, position_s: section.start_s, playing: true });
          }
        } else {
          // quantized/queued: land on the next simulated bar (~2s away)
          this.patchTransport({ queued_section: command.index });
        }
        break;
      }
      case 'set_stem_gain':
        this.patchStem(command.stem, { gain: clamp(command.gain, 0, 1) });
        break;
      case 'set_stem_muted':
        this.patchStem(command.stem, { muted: command.muted });
        break;
      case 'set_stem_soloed':
        this.patchStem(command.stem, { soloed: command.soloed });
        break;
      case 'set_master':
        this.patch({ master: clamp(command.gain, 0, 1) });
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
        this.patchTransport({ key_variant: clamp(command.semitones, -6, 6) });
        break;
      case 'set_tempo_pct':
        this.patchTransport({ tempo_pct: clamp(command.tempo_pct, 75, 125) });
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
        this.patch({ pads: { ...this.state.pads, running: true, chord: t.key } });
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

  subscribe(listener: (state: EngineState) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  // -------------------------------------------------------------------------

  private queuedCountdown = 0;

  private tick(dt: number): void {
    const t = this.state.transport;
    let changed = false;

    if (t.playing && t.duration_s > 0) {
      const pos = Math.min(t.duration_s, t.position_s + dt * (t.tempo_pct / 100));
      const current = currentSectionAt(t.sections, pos);
      this.state = {
        ...this.state,
        transport: { ...t, position_s: pos, current_section: current, playing: pos < t.duration_s },
      };
      changed = true;

      // Quantized/queued section launch: fire on the next simulated bar boundary (every 2s).
      if (t.queued_section !== null) {
        this.queuedCountdown += dt;
        if (this.queuedCountdown >= 2) {
          this.queuedCountdown = 0;
          const section = t.sections[t.queued_section];
          if (section) {
            this.state = {
              ...this.state,
              transport: {
                ...this.state.transport,
                position_s: section.start_s,
                current_section: t.queued_section,
                queued_section: null,
              },
            };
          }
        }
      }
    }

    // Animate meters: deterministic pseudo-noise, silent when muted/paused.
    const anySolo = this.state.stems.some((s) => s.soloed);
    const time = Date.now() / 1000;
    this.state = {
      ...this.state,
      stems: this.state.stems.map((s, i) => {
        const audible = t.playing && !s.muted && (!anySolo || s.soloed);
        const wave = 0.4 + 0.3 * Math.sin(time * (1.3 + i * 0.7)) + 0.2 * Math.sin(time * 5.1 + i);
        return { ...s, meter: audible ? clamp(wave * s.gain * this.state.master, 0, 1) : 0 };
      }),
    };
    changed = true;

    if (changed) this.emit();
  }

  private patch(partial: Partial<EngineState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private patchTransport(partial: Partial<TransportState>): void {
    this.state = { ...this.state, transport: { ...this.state.transport, ...partial } };
    this.emit();
  }

  private patchStem(stem: string, partial: Partial<EngineState['stems'][number]>): void {
    this.state = {
      ...this.state,
      stems: this.state.stems.map((s) => (s.stem === stem ? { ...s, ...partial } : s)),
    };
    this.emit();
  }

  private snapshot(): EngineState {
    return JSON.parse(JSON.stringify(this.state)) as EngineState;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((l) => l(snapshot));
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function currentSectionAt(sections: { start_s: number }[], pos: number): number {
  let idx = 0;
  sections.forEach((s, i) => {
    if (pos >= s.start_s) idx = i;
  });
  return idx;
}
