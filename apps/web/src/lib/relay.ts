/** Session relay base URL — the relay is a module INSIDE the api (DEC-52):
 * REST under /api/sessions + socket.io on the same origin. */
export const RELAY_URL: string =
  import.meta.env.VITE_RELAY_URL || import.meta.env.VITE_API_URL || 'http://localhost:3001'
