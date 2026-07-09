/** Session relay base URL (apps/relay) — REST + socket.io on one port. */
export const RELAY_URL: string = import.meta.env.VITE_RELAY_URL || 'http://localhost:3003'
