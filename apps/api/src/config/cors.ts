/**
 * The ONE CORS origin policy (WP-124) — consumed by the Express layer AND
 * the socket.io transport. Before this module the socket path shipped
 * `origin: true` (wide open) next to a strict REST policy in the same file;
 * one function, one truth.
 */

const STATIC_ALLOWED = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://laudasist.ro',
];

/** Dev boxes + phones on the wifi hitting the dev stack — RFC1918 only, never public. */
const PRIVATE_LAN =
    /^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

/** Any Firebase hosting domain (*.web.app, *.firebaseapp.com, *.hosted.app). */
const FIREBASE_HOSTING = /^https:\/\/.*\.(web\.app|firebaseapp\.com|hosted\.app)$/;

export function isAllowedOrigin(origin: string): boolean {
    return (
        STATIC_ALLOWED.includes(origin) ||
        PRIVATE_LAN.test(origin) ||
        FIREBASE_HOSTING.test(origin)
    );
}

/** Shape shared by the `cors` package and socket.io's cors option. */
export function corsOrigin(
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
): void {
    // No origin = same-origin requests, curl, native apps — allow.
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
}
