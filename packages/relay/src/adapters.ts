/**
 * Injected environment adapters (DEC-52): the relay package NEVER imports
 * firebase-admin. The cloud host (apps/api) supplies both adapters; the
 * light/LAN build constructs the relay with none — token verification then
 * degrades to "the Bearer token IS the owner id" (guests may host LAN
 * sessions) and the mirror is skipped entirely.
 */
export interface MirrorStoreAdapter {
  /** Persist one session's durable doc (transients already stripped). */
  set(sessionId: string, durable: Record<string, unknown>): Promise<void>;
  /** All still-active durable docs, for boot rehydration. */
  listActive(): Promise<{ id: string; data: Record<string, unknown> }[]>;
}

export interface RelayAdapters {
  /** Verified ID token → owner uid; absent = LAN mode (token is the id). */
  verifyOwnerToken?: (token: string) => Promise<string | null>;
  /** Durability mirror; absent = LAN mode (skipped, DEC-54). */
  mirror?: MirrorStoreAdapter;
}

export async function resolveOwnerId(
  adapters: RelayAdapters,
  token: string,
): Promise<string | null> {
  if (adapters.verifyOwnerToken) return adapters.verifyOwnerToken(token);
  return token || null;
}
