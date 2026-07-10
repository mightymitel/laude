/** Session relay base URL — the relay is a module INSIDE the api (DEC-52):
 * REST under /api/sessions + socket.io on the same origin. Env-configurable
 * (DEC-102); a production build without the var targets the single-backend
 * bundle serving this page (DEC-103). */
export const RELAY_URL: string =
  import.meta.env.VITE_RELAY_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin)
