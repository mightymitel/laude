import { auth } from './firebase';

// The api base URL is CONFIG (DEC-102): env var first, so splitting web from
// api/relay later is a config change. Unset in a production build means the
// single-backend bundle (DEC-103) where the api serves this very page.
const API_URL: string =
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

interface FetchOptions extends RequestInit {
    skipAuth?: boolean;
}

/**
 * API client with automatic auth token injection
 */
const REQUEST_TIMEOUT_MS = 15_000;

/** getIdToken talks to googleapis and can stall on flaky networks — nothing
 * awaiting apiFetch may hang the UI forever, so both the token exchange and
 * the request itself ride one deadline. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms),
        ),
    ]);
}

export async function apiFetch<T>(
    endpoint: string,
    options: FetchOptions = {}
): Promise<T> {
    const { skipAuth = false, headers = {}, ...rest } = options;

    const requestHeaders: HeadersInit = {
        'Content-Type': 'application/json',
        ...headers,
    };

    // Add auth token if available and not skipped
    if (!skipAuth && auth?.currentUser) {
        const token = await withTimeout(auth.currentUser.getIdToken(), REQUEST_TIMEOUT_MS, 'auth token');
        (requestHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(`${API_URL}${endpoint}`, {
            ...rest,
            headers: requestHeaders,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(abortTimer);
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

// Convenience methods
export const api = {
    get: <T>(endpoint: string, options?: FetchOptions) =>
        apiFetch<T>(endpoint, { ...options, method: 'GET' }),

    post: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
        apiFetch<T>(endpoint, {
            ...options,
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        }),

    put: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
        apiFetch<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined,
        }),

    delete: <T>(endpoint: string, options?: FetchOptions) =>
        apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),
};
