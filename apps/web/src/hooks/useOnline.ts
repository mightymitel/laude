/** Connectivity as state (WP-157): drives Go-Live gating + offline fallbacks. */
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    return () => {
        window.removeEventListener('online', onChange)
        window.removeEventListener('offline', onChange)
    }
}

export function useOnline(): boolean {
    return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}
