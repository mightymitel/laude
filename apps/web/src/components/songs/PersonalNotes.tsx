/**
 * Personal notes overlay (WP-162 / DEC-133): per-user × song, rendered on
 * song surfaces only — never projected, never in the session broadcast.
 */
import { useState } from 'react'

export function PersonalNotes({
    notes,
    onSave,
    saving,
}: {
    notes: string | undefined
    onSave: (notes: string | null) => void
    saving: boolean
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')

    const startEdit = () => {
        setDraft(notes ?? '')
        setEditing(true)
    }

    return (
        <section
            data-testid="personal-notes"
            aria-label="My notes"
            style={{
                margin: '1rem 0',
                padding: '0.9rem 1.1rem',
                borderRadius: '8px',
                background: 'var(--bg-tertiary)',
                border: '1px dashed var(--border)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                    📝 My notes <span style={{ fontWeight: 400, textTransform: 'none' }}>(only you see these)</span>
                </h3>
                {!editing && (
                    <button
                        data-testid="notes-edit"
                        onClick={startEdit}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                        {notes ? 'Edit' : 'Add note'}
                    </button>
                )}
            </div>

            {editing ? (
                <div style={{ marginTop: '0.5rem' }}>
                    <textarea
                        data-testid="notes-input"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={4}
                        maxLength={5000}
                        placeholder="Capo position, who leads, transitions…"
                        style={{
                            width: '100%',
                            padding: '0.6rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            resize: 'vertical',
                            fontSize: '0.9rem',
                        }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                        <button
                            data-testid="notes-save"
                            disabled={saving}
                            onClick={() => {
                                onSave(draft.trim() === '' ? null : draft.trim())
                                setEditing(false)
                            }}
                            style={{
                                background: 'var(--primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.4rem 1rem',
                                cursor: 'pointer',
                            }}
                        >
                            Save
                        </button>
                        <button
                            onClick={() => setEditing(false)}
                            style={{
                                background: 'none',
                                border: '1px solid var(--border)',
                                color: 'var(--text-secondary)',
                                borderRadius: '6px',
                                padding: '0.4rem 1rem',
                                cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        {notes && (
                            <button
                                data-testid="notes-clear"
                                disabled={saving}
                                onClick={() => {
                                    onSave(null)
                                    setEditing(false)
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    marginLeft: 'auto',
                                }}
                            >
                                Clear note
                            </button>
                        )}
                    </div>
                </div>
            ) : notes ? (
                <p data-testid="notes-text" style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
                    {notes}
                </p>
            ) : (
                <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No personal notes for this song yet.
                </p>
            )}
        </section>
    )
}
