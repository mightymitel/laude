/**
 * The ONE driver for pads: both the operator UI (PadsPanel) and the session
 * companion directives (SessionStrip) go through here, keeping the engine's
 * pad state and the audible PadEngine in lockstep.
 */
import { PAD_STYLES, type PadStyle } from '@laude/pad-engine';
import { engine, padEngine } from './engine';
import { interludeProgression } from './interlude';

export function padStyleOf(value: string): PadStyle {
  return PAD_STYLES.find((s) => s === value) ?? 'warm';
}

export const padsController = {
  start(key: string | null): void {
    padEngine.setKey(key);
    engine.send({ type: 'pad_start' });
    padEngine.start();
  },

  stop(): void {
    engine.send({ type: 'pad_stop' });
    padEngine.stop();
  },

  setStyle(style: PadStyle): void {
    engine.send({ type: 'pad_set_style', style });
    padEngine.setStyle(style);
  },

  setVolume(volume: number): void {
    engine.send({ type: 'pad_set_volume', volume });
    padEngine.setVolume(volume);
  },

  /** Interlude = instrumental: pads step the song's own progression. */
  async setInterlude(on: boolean, songId: string | null, key: string | null): Promise<void> {
    engine.send({ type: 'pad_interlude', on });
    if (on) {
      padEngine.startInterlude(await interludeProgression(songId, key ?? 'C'));
    } else {
      padEngine.stopInterlude();
    }
  },
};
