import { useState } from 'react'
import type { SessionState } from '@laude/session'
import type { WorshipSession } from '@laude/session'
import { VIEWPORT_CLASSES, type ViewportClass } from '@/viewports/contract'
import { directivesFor } from '@/viewports/ViewportRenderer'
import styles from './DirectivesBar.module.css'

/**
 * Owner/presenter controls for the broadcast viewport directives (DEC-41):
 * pick a target class, toggle blank/freeze, push or clear a message. The
 * session carries the whole map; viewports self-select by declared class.
 */
export function DirectivesBar({ session, state }: { session: WorshipSession; state: SessionState }) {
    const [target, setTarget] = useState<ViewportClass>('main')
    const [message, setMessage] = useState('')
    const active = directivesFor(state, target)

    return (
        <div className={styles.bar} data-testid="directives-bar">
            <span className={styles.label}>Screens:</span>
            {VIEWPORT_CLASSES.map((cls) => {
                const d = directivesFor(state, cls)
                const flagged = d.blank || d.freeze || (d.message !== null && d.message !== '')
                return (
                    <button
                        key={cls}
                        className={`${styles.classBtn} ${target === cls ? styles.classActive : ''}`}
                        onClick={() => setTarget(cls)}
                    >
                        {cls}
                        {flagged ? ' •' : ''}
                    </button>
                )
            })}
            <button
                className={`${styles.toggleBtn} ${active.blank ? styles.on : ''}`}
                onClick={() => session.setDirective(target, { blank: !active.blank })}
                title={`Blank the ${target} screens (others stay live)`}
            >
                Blank
            </button>
            <button
                className={`${styles.toggleBtn} ${active.freeze ? styles.on : ''}`}
                onClick={() => session.setDirective(target, { freeze: !active.freeze })}
                title={`Freeze the ${target} screens on their current content`}
            >
                Freeze
            </button>
            <input
                className={styles.messageInput}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message…"
            />
            {active.message !== null && active.message !== '' ? (
                <button
                    className={`${styles.toggleBtn} ${styles.on}`}
                    onClick={() => {
                        session.setDirective(target, { message: null })
                        setMessage('')
                    }}
                >
                    Clear message
                </button>
            ) : (
                <button
                    className={styles.toggleBtn}
                    disabled={message.trim() === ''}
                    onClick={() => session.setDirective(target, { message: message.trim() })}
                >
                    Show
                </button>
            )}
        </div>
    )
}
