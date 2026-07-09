/**
 * @laude/laudj-control-protocol — the operator-controls contract (tier 3).
 * In production this rides a LAN-local WebSocket between the tablet panel and
 * the engine (discovery via QR / laudj.local). The wireframe uses an
 * in-process MockEngine implementing the same contract (see ./mock).
 */
import type { StemName } from '@laude/song-model';
import type { PadStyle } from '@laude/pad-engine';

// ---------------------------------------------------------------------------
// State (engine → panel)
// ---------------------------------------------------------------------------

export interface StemChannelState {
  stem: StemName;
  gain: number; // 0..1
  muted: boolean;
  soloed: boolean;
  /** Live meter level 0..1 (animated by the engine). */
  meter: number;
}

export type TransitionType = 'immediate' | 'quantized' | 'queued';

export interface TransportState {
  playing: boolean;
  position_s: number;
  duration_s: number;
  song_id: string | null;
  song_title: string | null;
  /** Section list of the loaded performance. */
  sections: { label: string; start_s: number }[];
  current_section: number;
  /** Section queued for a quantized/queued launch, if any. */
  queued_section: number | null;
  key: string | null;
  /** Pre-rendered key variant offset in semitones. */
  key_variant: number;
  tempo_pct: number; // live time-stretch, ~±25%
}

export interface PadState {
  running: boolean;
  style: PadStyle;
  volume: number;
  interlude: boolean;
  chord: string | null;
}

// ---------------------------------------------------------------------------
// Part queue — operator-prepped play order; entries may span songs
// ---------------------------------------------------------------------------

export interface QueueEntryMods {
  /** Ramp the entry's level 0.55 → 1.0 across its total duration (repeats included). */
  crescendo: boolean;
  /** Solo one stem for the entry (mixer-solo semantics), or null. */
  solo: StemName | null;
  /** Worship "drop": drums + bass muted for the entry (stripped-back). */
  drop: boolean;
}

export interface QueueEntry {
  id: string;
  song_id: string;
  song_title: string;
  section_index: number;
  section_label: string;
  /** How many times the section plays before advancing (>= 1). */
  repeats: number;
  mods: QueueEntryMods;
}

/** The entry currently driving playback (popped off the queue). */
export type ActiveQueueEntry = QueueEntry & { repeats_left: number };

export interface EngineState {
  mode: 'pads_only' | 'full_engine';
  auto_advance: boolean;
  /** Set when a human presenter acted and LauDJ yielded its auto-advance. */
  yielded: boolean;
  transport: TransportState;
  stems: StemChannelState[];
  master: number;
  transition: { type: TransitionType; crossfade_s: number };
  pads: PadState;
  /** Prepped play order (operator-managed; the head plays next on auto-advance). */
  queue: QueueEntry[];
  /** Entry currently driving playback; null → the queue is disengaged. */
  queue_current: ActiveQueueEntry | null;
  session_connected: boolean;
}

// ---------------------------------------------------------------------------
// Commands (panel → engine)
// ---------------------------------------------------------------------------

export type EngineCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; position_s: number }
  | { type: 'load_song'; song_id: string }
  | { type: 'launch_section'; index: number }
  | { type: 'set_stem_gain'; stem: StemName; gain: number }
  | { type: 'set_stem_muted'; stem: StemName; muted: boolean }
  | { type: 'set_stem_soloed'; stem: StemName; soloed: boolean }
  | { type: 'set_master'; gain: number }
  | { type: 'set_transition'; transition: TransitionType; crossfade_s?: number }
  | { type: 'set_key_variant'; semitones: number }
  | { type: 'set_tempo_pct'; tempo_pct: number }
  | { type: 'set_mode'; mode: EngineState['mode'] }
  | { type: 'set_auto_advance'; enabled: boolean }
  | { type: 'resume_auto_advance' } // clears `yielded`
  | { type: 'pad_start' }
  | { type: 'pad_stop' }
  | { type: 'pad_set_style'; style: PadStyle }
  | { type: 'pad_set_volume'; volume: number }
  | { type: 'pad_interlude'; on: boolean }
  | { type: 'queue_add'; entry: Omit<QueueEntry, 'id'>; at?: number }
  | { type: 'queue_remove'; id: string }
  | { type: 'queue_move'; id: string; to: number }
  | { type: 'queue_update'; id: string; patch: Partial<Pick<QueueEntry, 'repeats' | 'mods'>> }
  | { type: 'queue_clear' }
  /** Start this entry immediately (honoring the transition setting); pops it into queue_current. */
  | { type: 'queue_play_now'; id: string };

/** Wire envelope (WebSocket frames when the real engine ships). */
export type PanelMessage = { kind: 'command'; command: EngineCommand };
export type EngineMessage = { kind: 'state'; state: EngineState };

/** What both the mock and the real WS client expose to the panel UI. */
export interface EngineConnection {
  send(command: EngineCommand): void;
  subscribe(listener: (state: EngineState) => void): () => void;
  readonly connected: boolean;
}
