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
        const token = await auth.currentUser.getIdToken();
        (requestHeaders as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...rest,
        headers: requestHeaders,
    });

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
