/**
 * Stable per-tab presenter identity for the session view. The whole presenter
 * object (including joined_at) is persisted so re-joining arrayUnions the
 * exact same value instead of piling up duplicates on refresh.
 */
import type { Presenter } from '@laude/song-model';

const STORAGE_KEY = 'laudasist.presenter';

export function loadPresenter(): Presenter {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'id' in parsed &&
        typeof parsed.id === 'string' &&
        'name' in parsed &&
        typeof parsed.name === 'string' &&
        'joined_at' in parsed &&
        typeof parsed.joined_at === 'string'
      ) {
        return { id: parsed.id, name: parsed.name, kind: 'human', joined_at: parsed.joined_at };
      }
    } catch {
      // Corrupt storage — fall through and mint a fresh identity.
    }
  }
  const fresh: Presenter = {
    id: `human-${Math.random().toString(36).slice(2, 6)}`,
    // Seeded data value, not a UI string (mirrors the contract examples).
    name: 'Prezentator',
    kind: 'human',
    joined_at: new Date().toISOString(),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

const VIEWER_KEY = 'laudasist.viewer';

/** Stable per-tab viewer identity (viewers are roster members too). */
export function loadViewerIdentity(): Presenter {
  const raw = sessionStorage.getItem(VIEWER_KEY);
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'id' in parsed &&
        typeof parsed.id === 'string' &&
        'name' in parsed &&
        typeof parsed.name === 'string' &&
        'joined_at' in parsed &&
        typeof parsed.joined_at === 'string'
      ) {
        return { id: parsed.id, name: parsed.name, kind: 'human', joined_at: parsed.joined_at };
      }
    } catch {
      // Corrupt storage — fall through and mint a fresh identity.
    }
  }
  const fresh: Presenter = {
    id: `viewer-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Viewer',
    kind: 'human',
    joined_at: new Date().toISOString(),
  };
  sessionStorage.setItem(VIEWER_KEY, JSON.stringify(fresh));
  return fresh;
}
