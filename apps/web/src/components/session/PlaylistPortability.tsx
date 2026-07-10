import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { parsePortable, toPortable, type SessionPlaylistItem } from '@laude/session'
import { auth } from '@/lib/firebase'
import { useCreatePlaylist, useUpdatePlaylist } from '@/hooks/usePlaylists'
import styles from '../PlaylistPanel.module.css'

/**
 * The playlist's portability verbs (DEC-38): EXPORT to a versioned file
 * (anyone, incl. guests) · IMPORT into this session (clone-in, appended,
 * songs stay by-value — linking is offered elsewhere, never automatic) ·
 * SAVE to the cloud (authenticated only; guests get the sign-in prompt at
 * the save moment — the conversion funnel, unforced).
 */
export function PlaylistPortability({
    items,
    onImport,
}: {
    items: SessionPlaylistItem[]
    onImport: (items: SessionPlaylistItem[]) => void
}) {
    const navigate = useNavigate()
    const fileRef = useRef<HTMLInputElement>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const createPlaylist = useCreatePlaylist()
    const updatePlaylist = useUpdatePlaylist()

    const exportFile = () => {
        const name = window.prompt('Playlist name for the export:', 'playlist') ?? 'playlist'
        const envelope = toPortable(name, items)
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${name.replace(/[^\w-]+/g, '-') || 'playlist'}.laude-playlist.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const importFile = async (file: File) => {
        try {
            const parsed = parsePortable(JSON.parse(await file.text()))
            if (!parsed.ok) {
                setNotice(`Import failed: ${parsed.error}`)
                return
            }
            onImport(parsed.items)
            setNotice(`Imported ${parsed.items.length} songs from "${parsed.name}"`)
        } catch {
            setNotice('Import failed: not a valid playlist file')
        }
    }

    const save = async () => {
        if (!auth.currentUser) {
            // The natural conversion moment: saving needs an account. Coming
            // back lands in the SAME working session (persisted durable slice).
            if (window.confirm('Saving a playlist needs an account. Sign in now?')) {
                void navigate({ to: '/login', search: { redirect: 'session' } })
            }
            return
        }
        const name = window.prompt('Save playlist as:', 'My set')
        if (!name) return
        try {
            const created = await createPlaylist.mutateAsync({ name })
            await updatePlaylist.mutateAsync({
                id: created.id,
                items: items.map((item, order) => ({ ...item, order })),
            })
            setNotice(`Saved "${name}" (${items.length} songs)`)
        } catch (err) {
            setNotice(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed')
        }
    }

    return (
        <div className={styles.portability}>
            <button className={styles.loadBtn} onClick={exportFile} disabled={items.length === 0} title="Download this playlist as a file (no account needed)">
                ⬇ Export
            </button>
            <button className={styles.loadBtn} onClick={() => fileRef.current?.click()} title="Add songs from an exported playlist file">
                ⬆ Import
            </button>
            <button className={styles.loadBtn} onClick={() => void save()} disabled={items.length === 0} title="Save to your account">
                ☁ Save
            </button>
            <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void importFile(file)
                    e.target.value = ''
                }}
            />
            {notice !== null && (
                <span className={styles.portabilityNotice} onClick={() => setNotice(null)}>
                    {notice}
                </span>
            )}
        </div>
    )
}
