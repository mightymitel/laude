/**
 * One live connection to the session relay (viewer or presenter), as React
 * state. Replaces the old socket+poll pair (useSessionState) and the platform
 * Firestore onSnapshot path — the relay pushes every change.
 */
import { useEffect, useRef, useState } from 'react'
import { SessionClient, type SessionIdentity, type SessionState } from '@laude/session'
import { RELAY_URL } from '@/lib/relay'

export interface SessionConnection {
    state: SessionState | null
    /** Non-null once joined; call client.send/setCurrent/… to write (presenters only). */
    client: SessionClient | null
    connected: boolean
    error: string | null
}

/**
 * Join with an accessCode (viewer) or presenterCode; the ROLE is resolved by
 * the relay from the code used. Pass null to stay disconnected. The member
 * identity is captured per connection and should stay stable for its lifetime.
 */
export function useSessionConnection(code: string | null, member: SessionIdentity): SessionConnection {
    const [state, setState] = useState<SessionState | null>(null)
    const [client, setClient] = useState<SessionClient | null>(null)
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const memberRef = useRef(member)
    memberRef.current = member

    useEffect(() => {
        if (!code) {
            setState(null)
            setClient(null)
            setConnected(false)
            setError(null)
            return
        }
        let cancelled = false
        let active: SessionClient | null = null

        SessionClient.connect({ url: RELAY_URL, code, member: memberRef.current })
            .then((c) => {
                if (cancelled) {
                    c.leave()
                    return
                }
                active = c
                setClient(c)
                setConnected(true)
                setError(null)
                c.subscribe((change) => setState(change.state))
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err))
                    setConnected(false)
                }
            })

        return () => {
            cancelled = true
            active?.leave()
            setClient(null)
            setConnected(false)
        }
    }, [code])

    return { state, client, connected, error }
}
