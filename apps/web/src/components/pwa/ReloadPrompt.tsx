/**
 * Service-worker update flow (WP-155): a deploy never reloads the app on its
 * own — a silent reload would tear down a live worship session. Instead the
 * waiting worker surfaces this small toast and the USER chooses when.
 */
import { useRegisterSW } from 'virtual:pwa-register/react'

export function ReloadPrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW()

    if (!needRefresh) return null

    return (
        <div
            role="status"
            style={{
                position: 'fixed',
                bottom: 'calc(1rem + env(safe-area-inset-bottom))',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 300,
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 1rem',
                borderRadius: '999px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
                fontSize: '0.9rem',
            }}
        >
            <span>A new version of Laudasist is ready.</span>
            <button
                onClick={() => void updateServiceWorker(true)}
                style={{
                    background: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '0.35rem 0.9rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                }}
            >
                Refresh
            </button>
            <button
                onClick={() => setNeedRefresh(false)}
                aria-label="Dismiss update"
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                }}
            >
                ✕
            </button>
        </div>
    )
}
