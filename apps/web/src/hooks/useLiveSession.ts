/**
 * Owner-side session controller: go live (relay mints viewer + presenter
 * links), connect as a presenter over @laude/session, end the session.
 * The single write path is SessionClient.send — no REST mutation + socket
 * echo dance, no polling.
 */
import { useCallback, useMemo, useState } from 'react'
import {
    endLiveSession,
    startLiveSession,
    type SessionPatch,
    type SessionPlaylistItem,
    type SessionState,
} from '@laude/session'
import type { Presenter } from '@laude/song-model'
import { auth } from '@/lib/firebase'
import { RELAY_URL } from '@/lib/relay'
import { useSessionConnection } from './useSessionConnection'

interface LiveSessionContext {
    id: string
    accessCode: string
    presenterCode: string
}

function ownerPresenter(): Presenter {
    const user = auth.currentUser
    return {
        id: user ? `owner-${user.uid}` : `owner-${Math.random().toString(36).slice(2, 8)}`,
        name: user?.displayName || 'Owner',
        kind: 'human',
        joined_at: new Date().toISOString(),
    }
}

export function useLiveSession() {
    const [context, setContext] = useState<LiveSessionContext | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const presenter = useMemo(ownerPresenter, [])
    const { state, client, connected } = useSessionConnection(
        context?.presenterCode ?? null,
        presenter,
    )

    const isLive = context !== null
    const session: SessionState | null = state ?? null

    const startLive = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const user = auth.currentUser
            if (!user) throw new Error('Sign in to go live')
            const idToken = await user.getIdToken()
            const created = await startLiveSession(RELAY_URL, idToken)
            if (!created.presenterCode) throw new Error('Relay returned no presenter code')
            setContext({
                id: created.id,
                accessCode: created.accessCode,
                presenterCode: created.presenterCode,
            })
            return created
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start session')
            return null
        } finally {
            setIsLoading(false)
        }
    }, [])

    const endLive = useCallback(async () => {
        if (!context) return
        try {
            const user = auth.currentUser
            if (!user) throw new Error('Sign in to end the session')
            await endLiveSession(RELAY_URL, await user.getIdToken(), context.id)
            setContext(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to end session')
        }
    }, [context])

    const updateSession = useCallback(
        (patch: SessionPatch) => {
            client?.send(patch)
        },
        [client],
    )

    const setPartIndex = useCallback(
        (index: number) => {
            client?.setCurrent({ section_index: index })
        },
        [client],
    )

    const setPlaylist = useCallback(
        (items: SessionPlaylistItem[]) => {
            client?.setPlaylist(items)
        },
        [client],
    )

    const getShareUrl = useCallback(() => {
        if (!context) return ''
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        return `${baseUrl}/view/${context.accessCode}`
    }, [context])

    const getPresenterUrl = useCallback(() => {
        if (!context) return ''
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        return `${baseUrl}/present/${context.presenterCode}`
    }, [context])

    return {
        session,
        isLive,
        isLoading,
        error,
        socketConnected: connected,
        startLive,
        endLive,
        updateSession,
        setPartIndex,
        setPlaylist,
        getShareUrl,
        getPresenterUrl,
    }
}
