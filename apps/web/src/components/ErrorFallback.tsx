/**
 * Error boundaries (WP-125): a crash anywhere — especially on a projection
 * surface mid-live-session — must render a RECOVERABLE state, never a white
 * screen. Wired as the router's defaultErrorComponent plus explicit
 * errorComponent on the session/view/present routes.
 */
import type { ErrorComponentProps } from '@tanstack/react-router'

export function ErrorFallback({ error, reset }: ErrorComponentProps) {
    return (
        <div
            role="alert"
            data-testid="error-fallback"
            style={{
                minHeight: '60vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                padding: '2rem',
                textAlign: 'center',
                background: 'var(--bg-primary, #111827)',
                color: 'var(--text-primary, #f9fafb)',
            }}
        >
            <div style={{ fontSize: '2.5rem' }} aria-hidden>
                ⚠️
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 600 }}>Something went wrong on this screen</h2>
            <p style={{ color: 'var(--text-secondary, #9ca3af)', maxWidth: '28rem', fontSize: '0.95rem' }}>
                The rest of the session is unaffected. Try again — if it keeps happening,
                reload the page.
            </p>
            <details
                style={{
                    color: 'var(--text-muted, #6b7280)',
                    fontSize: '0.8rem',
                    maxWidth: '32rem',
                    overflowWrap: 'anywhere',
                }}
            >
                <summary style={{ cursor: 'pointer' }}>Error details</summary>
                {error instanceof Error ? error.message : String(error)}
            </details>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                    onClick={() => reset()}
                    data-testid="error-retry"
                    style={{
                        background: 'var(--primary, #4f46e5)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '0.6rem 1.4rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                    }}
                >
                    Try again
                </button>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        background: 'none',
                        color: 'var(--text-secondary, #9ca3af)',
                        border: '1px solid var(--border, #374151)',
                        borderRadius: '8px',
                        padding: '0.6rem 1.4rem',
                        cursor: 'pointer',
                    }}
                >
                    Reload
                </button>
            </div>
        </div>
    )
}

/**
 * DEV/e2e-only crash injector: call at the top of a route component; a
 * sessionStorage flag throws during render so the e2e suite can assert the
 * boundary. sessionStorage (not a URL param) because the router normalizes
 * unknown search params away — a race the tests must not depend on.
 * Compiled out of production bundles (import.meta.env.DEV).
 */
export function maybeDevCrash(): void {
    if (import.meta.env.DEV && sessionStorage.getItem('laudasist.devCrash') === '1') {
        throw new Error('maybeDevCrash: deliberate test crash (laudasist.devCrash)')
    }
}
