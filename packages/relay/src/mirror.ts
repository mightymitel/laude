/**
 * Mirror plumbing around the injected store adapter: the relay owns WHAT is
 * durable (transients stripped) and WHEN (debounced); the adapter owns WHERE
 * (Firestore in the cloud host; nothing in LAN mode).
 */
import type { SessionState } from '@laude/session';
import type { MirrorStoreAdapter } from './adapters';
import type { SessionStore } from './state';

const DEBOUNCE_MS = 500;

export class Mirror {
  private timers = new Map<string, NodeJS.Timeout>();
  private warned = false;

  constructor(private readonly adapter: MirrorStoreAdapter | undefined) {}

  /** Debounced best-effort write of one session's durable state. */
  write(session: SessionState): void {
    if (!this.adapter) return;
    const adapter = this.adapter;
    const existing = this.timers.get(session.id);
    if (existing) clearTimeout(existing);
    this.timers.set(
      session.id,
      setTimeout(() => {
        this.timers.delete(session.id);
        // Roster + DJ manifest are transient (presence) — never persisted.
        const { presenters: _p, dj_manifest: _m, ...durable } = session;
        adapter.set(session.id, durable).catch((err: unknown) => {
          if (!this.warned) {
            this.warned = true;
            console.warn('relay: mirror write failed (will keep trying silently)', err);
          }
        });
      }, DEBOUNCE_MS),
    );
  }

  /** Relay boot: reload active sessions so live links survive a restart. */
  async rehydrate(store: SessionStore): Promise<number> {
    if (!this.adapter) return 0;
    try {
      const docs = await this.adapter.listActive();
      let count = 0;
      for (const { id, data } of docs) {
        if (typeof data.accessCode === 'string' && typeof data.ownerId === 'string') {
          // Boundary cast: durable docs are written exclusively by write()
          // above, so an active doc IS a SessionState minus the transient
          // fields (restore() re-defaults those). The key spot-check guards
          // against foreign docs.
          store.restore({ ...(data as unknown as SessionState), id });
          count += 1;
        }
      }
      return count;
    } catch (err) {
      console.warn('relay: mirror rehydrate failed — starting empty', err);
      return 0;
    }
  }
}
