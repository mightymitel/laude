/**
 * The owner surface's session hook (DEC-35): a personal session exists
 * immediately — same session object, LOCAL transport, no relay, no links.
 * Go Live swaps the transport (pushes local state as the relay's initial
 * snapshot, mints fresh links); Stop Live swaps back keeping the state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { WorshipSession, type GoLiveResult, type SessionState } from '@laude/session'
import { auth } from '@/lib/firebase'
import { RELAY_URL } from '@/lib/relay'
import { loadPresenter } from '@/lib/presenter'

function ownerIdentity() {
    const stored = loadPresenter()
    const user = auth.currentUser
    return {
        id: user ? `owner-${user.uid}` : stored.id,
        name: user?.displayName || stored.name,
        kind: 'human' as const,
    }
}

export function useWorshipSession() {
    const sessionRef = useRef<WorshipSession | null>(null)
    if (sessionRef.current === null) {
        sessionRef.current = new WorshipSession(ownerIdentity())
    }
    const session = sessionRef.current

    const [state, setState] = useState<SessionState | null>(session.state)
    const [isLive, setIsLive] = useState(session.isLive)
    const [links, setLinks] = useState<GoLiveResult | null>(session.links)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const unsub = session.subscribe((change) => {
            setState(change.state)
            setIsLive(session.isLive)
            setLinks(session.links)
        })
        return () => {
            unsub()
        }
    }, [session])

    useEffect(() => {
        return () => {
            session.dispose()
        }
    }, [session])

    const goLive = useCallback(async (): Promise<GoLiveResult | null> => {
        setIsLoading(true)
        setError(null)
        try {
            const user = auth.currentUser
            if (!user) throw new Error('Sign in to go live')
            const result = await session.goLive(RELAY_URL, await user.getIdToken())
            setIsLive(true)
            setLinks(result)
            return result
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to go live')
            return null
        } finally {
            setIsLoading(false)
        }
    }, [session])

    const stopLive = useCallback(async () => {
        setError(null)
        try {
            const user = auth.currentUser
            if (!user) throw new Error('Sign in to end the live session')
            await session.stopLive(RELAY_URL, await user.getIdToken())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to stop the live session')
        } finally {
            setIsLive(session.isLive)
            setLinks(session.links)
        }
    }, [session])

    const getShareUrl = useCallback(() => {
        if (!links) return ''
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        return `${baseUrl}/view/${links.accessCode}`
    }, [links])

    const getPresenterUrl = useCallback(() => {
        if (!links) return ''
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        return `${baseUrl}/present/${links.presenterCode}`
    }, [links])

    return {
        session,
        state,
        isLive,
        links,
        isLoading,
        error,
        goLive,
        stopLive,
        getShareUrl,
        getPresenterUrl,
    }
}
