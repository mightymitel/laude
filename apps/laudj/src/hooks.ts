/** React bindings for the engine/pads/song-registry stores. */
import { useEffect, useState } from 'react';
import type { EngineState } from '@laude/laudj-control-protocol';
import type { PadEngineState } from '@laude/pad-engine';
import type { EngineSong } from './audio-engine';
import { engine, getRegisteredSongs, padEngine, subscribeSongs } from './engine';

/** Live engine state; null only before the first (synchronous) snapshot. */
export function useEngineState(): EngineState | null {
  const [state, setState] = useState<EngineState | null>(null);
  useEffect(() => engine.subscribe(setState), []);
  return state;
}

export function usePadState(): PadEngineState {
  const [state, setState] = useState<PadEngineState>(() => padEngine.getState());
  useEffect(() => padEngine.subscribe(setState), []);
  return state;
}

export function useSongs(): EngineSong[] {
  const [songs, setSongs] = useState<EngineSong[]>(() => getRegisteredSongs());
  useEffect(() => subscribeSongs(() => setSongs(getRegisteredSongs())), []);
  return songs;
}
