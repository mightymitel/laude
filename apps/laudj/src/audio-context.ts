/**
 * Shared lazy AudioContext — one output for stems and pads. Browsers gate
 * audible contexts behind a user gesture, so this is only called from command
 * handlers that run inside one (play / pad_start / immediate section launch).
 */
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}
