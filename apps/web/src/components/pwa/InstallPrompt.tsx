/**
 * Install UX (WP-156). Two worlds:
 *  - Android/desktop Chrome: capture `beforeinstallprompt`, offer an
 *    "Install Laudasist" affordance that replays the native prompt.
 *  - iOS Safari: no programmatic prompt exists — show a one-time
 *    "Add to Home Screen" hint, iOS Safari ONLY.
 * A dismissal persists per device; already-installed (standalone) shows
 * nothing.
 */
import { useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'

// The event is Chromium-only and not in lib.dom — typed here, no `any`.
interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'laudasist.installPrompt.dismissed'

function isStandalone(): boolean {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    // iOS Safari's pre-standard flag.
    const nav: Navigator & { standalone?: boolean } = navigator
    return nav.standalone === true
}

function isIosSafari(): boolean {
    const ua = navigator.userAgent
    const isIos = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
    // Chrome/Firefox/Edge on iOS can't install PWAs either, but the Share →
    // Add to Home Screen path is Safari's — hint only there.
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    return isIos && isSafari
}

export function InstallPrompt() {
    const pathname = useRouterState({ select: (s) => s.location.pathname })
    const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
    const [iosHint] = useState(() => isIosSafari())

    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault()
            // The cast-free way: the handler only fires for this event type.
            if ('prompt' in e && 'userChoice' in e) {
                setInstallEvent(e as unknown as BeforeInstallPromptEvent) // narrowed above; lib.dom has no BIP type
            }
        }
        window.addEventListener('beforeinstallprompt', handler)
        return () => window.removeEventListener('beforeinstallprompt', handler)
    }, [])

    // Projection/guest surfaces stay chrome-free during worship.
    const suppressed = pathname.startsWith('/view/') || pathname.startsWith('/present/')
    if (suppressed || dismissed || isStandalone()) return null
    if (installEvent === null && !iosHint) return null

    const dismiss = () => {
        localStorage.setItem(DISMISSED_KEY, '1')
        setDismissed(true)
    }

    return (
        <div
            role="complementary"
            aria-label="Install Laudasist"
            style={{
                position: 'fixed',
                bottom: 'calc(4rem + env(safe-area-inset-bottom))',
                right: '1rem',
                zIndex: 250,
                maxWidth: '20rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.7rem 0.9rem',
                borderRadius: '12px',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
                fontSize: '0.85rem',
            }}
        >
            {installEvent !== null ? (
                <>
                    <span>Install Laudasist for full-screen and offline use.</span>
                    <button
                        data-testid="install-app"
                        onClick={() => {
                            void installEvent.prompt()
                            void installEvent.userChoice.then(() => setInstallEvent(null))
                        }}
                        style={{
                            background: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.4rem 0.8rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Install
                    </button>
                </>
            ) : (
                <span>
                    Install Laudasist: tap <strong>Share</strong> <span aria-hidden>⎋</span> then{' '}
                    <strong>Add to Home Screen</strong>.
                </span>
            )}
            <button
                onClick={dismiss}
                aria-label="Dismiss install hint"
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    lineHeight: 1,
                }}
            >
                ✕
            </button>
        </div>
    )
}
