import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { SessionPlaylistItem } from '@laude/session'
import { auth } from '@/lib/firebase'
import { useCreateSavedSession, useUpdateSavedSession } from '@/hooks/useSavedSessions'
import styles from '../PlaylistPanel.module.css'

/**
 * Flow 3's save verb (DEC-96): persist the working playlist as a NAMED,
 * owner-scoped session that reopens later and can go live repeatedly.
 * Distinct from the playlist Save (a reusable set): a saved session is one
 * prepared evening. Items travel by-value, like everything session-shaped.
 */
export function SavedSessionBar({
    items,
    savedSessionId,
    savedSessionName,
}: {
    items: SessionPlaylistItem[]
    savedSessionId: string | undefined
    savedSessionName: string | undefined
}) {
    const navigate = useNavigate()
    const [notice, setNotice] = useState<string | null>(null)
    const create = useCreateSavedSession()
    const update = useUpdateSavedSession()

    const save = async () => {
        if (!auth.currentUser) {
            if (window.confirm('Saving a session needs an account. Sign in now?')) {
                void navigate({ to: '/login' })
            }
            return
        }
        try {
            if (savedSessionId !== undefined) {
                await update.mutateAsync({ id: savedSessionId, items })
                setNotice(`Updated "${savedSessionName ?? 'session'}"`)
                return
            }
            const name = window.prompt('Save session as:', 'Seara de laudă')
            if (!name) return
            const created = await create.mutateAsync({ name, items })
            setNotice(`Saved "${name}"`)
            // The page now owns a persisted session: keep the id in the URL
            // so further saves update it and a reload reopens it.
            void navigate({
                to: '/session',
                search: (prev: Record<string, unknown>) => ({ ...prev, savedSessionId: created.id }),
                replace: true,
            })
        } catch (err) {
            setNotice(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed')
        }
    }

    return (
        <div className={styles.portability}>
            <button
                className={styles.loadBtn}
                onClick={() => void save()}
                disabled={items.length === 0 || create.isPending || update.isPending}
                data-testid="save-session"
                title="Save this session (name + playlist) to open again later"
            >
                💾 {savedSessionId !== undefined ? `Update "${savedSessionName ?? 'session'}"` : 'Save session'}
            </button>
            {notice !== null && (
                <span className={styles.portabilityNotice} onClick={() => setNotice(null)}>
                    {notice}
                </span>
            )}
        </div>
    )
}
