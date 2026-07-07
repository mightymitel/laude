/**
 * QueueController — the part-queue state machine behind LaudjEngine.
 *
 * Owns queue/queue_current transitions and per-entry mods; playback itself is
 * driven through a narrow port into the engine. Rules:
 *  - The queue engages ONLY via queue_play_now (plain transport play never
 *    hijacks it); it disengages when the last entry finishes or the operator
 *    loads a song manually (abortCurrent).
 *  - At a section boundary (engine tick detects it) an armed engine calls
 *    advance(): repeat the section, start the next entry, or disengage.
 *  - Mods apply at entry start and restore at entry end from a snapshot; if
 *    the operator overrode a flag mid-entry, that write wins (only values the
 *    mod itself set — and that are still set — are restored).
 *  - Crescendo is a dedicated live level factor (0.55→1.0 over the entry),
 *    multiplied into the mix master; the operator's master is never written.
 */
import type {
  ActiveQueueEntry,
  EngineState,
  QueueEntry,
  StemChannelState,
  TransportState,
} from '@laude/laudj-control-protocol';
import type { StemName } from '@laude/song-model';
import { crescendoLevel, insertEntry, moveEntry, removeEntry, sectionSpan, updateEntry } from './queue-ops';

export interface QueuePort {
  state(): EngineState;
  setQueue(queue: QueueEntry[]): void;
  setCurrent(current: ActiveQueueEntry | null): void;
  patchStem(stem: StemName, partial: Partial<StemChannelState>): void;
  /** Push the (possibly crescendo-scaled) mix to the live audio graph. */
  applyMix(): void;
  /** Load another song (engine's normal path: real stems or simulated fallback). */
  loadSong(songId: string): void;
  /** Jump to a position in the loaded song and make sure playback runs. */
  seekPlay(positionS: number): void;
  /** Same-song launch honoring the operator's transition setting. */
  launchSection(index: number): void;
  /** Create/resume the AudioContext (explicit operator actions only). */
  gesture(): void;
  /** Hint: the queue head's song differs from the loaded one → warm its stems. */
  prefetch(songId: string | null): void;
}

interface ModsSnapshot {
  solo?: { stem: StemName; before: boolean };
  drop?: { drums: boolean; bass: boolean };
}

export class QueueController {
  private seq = 0;
  private snapshot: ModsSnapshot = {};

  constructor(private readonly port: QueuePort) {}

  add(entry: Omit<QueueEntry, 'id'>, at?: number): void {
    this.seq += 1;
    const full: QueueEntry = {
      ...entry,
      repeats: Math.max(1, Math.round(entry.repeats)),
      id: `q${this.seq}`,
    };
    this.port.setQueue(insertEntry(this.port.state().queue, full, at));
    this.refreshPrefetch();
  }

  remove(id: string): void {
    this.port.setQueue(removeEntry(this.port.state().queue, id));
    this.refreshPrefetch();
  }

  move(id: string, to: number): void {
    this.port.setQueue(moveEntry(this.port.state().queue, id, to));
    this.refreshPrefetch();
  }

  update(id: string, patch: Partial<Pick<QueueEntry, 'repeats' | 'mods'>>): void {
    this.port.setQueue(updateEntry(this.port.state().queue, id, patch));
  }

  clear(): void {
    this.port.setQueue([]);
    this.refreshPrefetch();
  }

  /** Explicit operator start: always works, even while yielded. */
  playNow(id: string): void {
    const s = this.port.state();
    const entry = s.queue.find((e) => e.id === id);
    if (!entry) return;
    this.port.gesture();
    if (s.queue_current) this.restoreMods();
    this.port.setQueue(removeEntry(s.queue, id));
    this.begin(entry, 'operator');
  }

  /** Operator loaded a song manually → the active entry is over; the queue stays prepped. */
  abortCurrent(): void {
    if (!this.port.state().queue_current) return;
    this.restoreMods();
    this.port.setCurrent(null);
    this.port.applyMix();
  }

  /** Tick check: has the active entry crossed the end of its section span? */
  boundaryReached(t: TransportState): boolean {
    const qc = this.port.state().queue_current;
    if (!qc) return false;
    const span = sectionSpan(t.sections, qc.section_index, t.duration_s);
    if (!span) return true; // section vanished (song switched under us) → finish the entry
    return t.position_s >= span.end - 1e-3;
  }

  /** Boundary hit while armed: repeat, start the next entry, or disengage. */
  advance(): void {
    const s = this.port.state();
    const qc = s.queue_current;
    if (!qc) return;
    const span = sectionSpan(s.transport.sections, qc.section_index, s.transport.duration_s);
    if (span && qc.repeats_left > 1) {
      this.port.setCurrent({ ...qc, repeats_left: qc.repeats_left - 1 });
      this.port.seekPlay(span.start);
      return;
    }
    this.restoreMods();
    const next = s.queue[0];
    if (!next) {
      // Queue exhausted: disengage; playback simply continues into the song.
      this.port.setCurrent(null);
      this.port.applyMix();
      return;
    }
    this.port.setQueue(s.queue.slice(1));
    this.begin(next, 'auto');
  }

  /** Live crescendo factor for the mix master, or null when inactive. */
  crescendoFactor(): number | null {
    const s = this.port.state();
    const qc = s.queue_current;
    if (!qc || !qc.mods.crescendo) return null;
    const span = sectionSpan(s.transport.sections, qc.section_index, s.transport.duration_s);
    return span ? crescendoLevel(qc, span, s.transport.position_s) : null;
  }

  // ---------------------------------------------------------------------------

  private begin(entry: QueueEntry, via: 'operator' | 'auto'): void {
    this.port.setCurrent({ ...entry, repeats_left: entry.repeats });
    const s = this.port.state();
    if (entry.song_id !== s.transport.song_id) {
      // Cross-song: load (prefetched stems make this fast), start at the part.
      this.port.loadSong(entry.song_id);
      const t = this.port.state().transport;
      const span = sectionSpan(t.sections, entry.section_index, t.duration_s);
      this.port.seekPlay(span ? span.start : 0);
    } else if (via === 'operator' && s.transport.playing) {
      // Honors the transition setting (quantized lands on the next beat; the
      // mods below apply right away — at most one beat early, musically fine).
      this.port.launchSection(entry.section_index);
    } else {
      // Auto-advance fires exactly at a section boundary → jump immediately.
      // (Operator start from a paused transport also jumps straight in.)
      const span = sectionSpan(s.transport.sections, entry.section_index, s.transport.duration_s);
      this.port.seekPlay(span ? span.start : 0);
    }
    this.applyMods(entry);
    this.port.applyMix();
    this.refreshPrefetch();
  }

  private applyMods(entry: QueueEntry): void {
    this.snapshot = {};
    const stems = this.port.state().stems;
    const flag = (stem: StemName, key: 'muted' | 'soloed'): boolean =>
      stems.find((c) => c.stem === stem)?.[key] ?? false;
    if (entry.mods.solo) {
      this.snapshot.solo = { stem: entry.mods.solo, before: flag(entry.mods.solo, 'soloed') };
      this.port.patchStem(entry.mods.solo, { soloed: true });
    }
    if (entry.mods.drop) {
      this.snapshot.drop = { drums: flag('drums', 'muted'), bass: flag('bass', 'muted') };
      this.port.patchStem('drums', { muted: true });
      this.port.patchStem('bass', { muted: true });
    }
  }

  private restoreMods(): void {
    const snap = this.snapshot;
    this.snapshot = {};
    const stems = this.port.state().stems;
    if (snap.solo) {
      const { stem, before } = snap.solo;
      const now = stems.find((c) => c.stem === stem)?.soloed ?? false;
      // Restore only what the mod changed and the operator didn't overwrite.
      if (now && !before) this.port.patchStem(stem, { soloed: false });
    }
    if (snap.drop) {
      (['drums', 'bass'] as const).forEach((stem) => {
        const before = snap.drop ? snap.drop[stem] : false;
        const now = stems.find((c) => c.stem === stem)?.muted ?? false;
        if (now && !before) this.port.patchStem(stem, { muted: false });
      });
    }
  }

  private refreshPrefetch(): void {
    const s = this.port.state();
    const head = s.queue[0];
    this.port.prefetch(head && head.song_id !== s.transport.song_id ? head.song_id : null);
  }
}
