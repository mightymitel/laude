import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { listNotations } from '@laude/chords'
import { useSessionConnection } from '@/hooks/useSessionConnection'
import { loadViewerIdentity } from '@/lib/presenter'
import {
    VIEWPORT_CLASSES,
    asViewportClass,
    type ViewportStyleOptions,
} from '@/viewports/contract'
import { VIEWPORT_PRESETS, loadViewportOptions, saveViewportOptions } from '@/viewports/presets'
import { ViewportRenderer } from '@/viewports/ViewportRenderer'
import styles from './view.module.css'

export const Route = createFileRoute('/view/$code/')({
    component: GuestViewPage,
    validateSearch: (search: Record<string, unknown>) => {
        return {
            type: typeof search.type === 'string' ? search.type : undefined,
        }
    },
})

function GuestViewPage() {
    const { code } = Route.useParams()
    const { type } = Route.useSearch()
    const navigate = useNavigate()

    // A viewport is an ORDINARY viewer of the session — same link, same join
    // path (DEC-41); it self-selects directives by its declared class.
    const viewportClass = asViewportClass(type)

    const viewer = useMemo(() => loadViewerIdentity(), [])
    const { state: session, error } = useSessionConnection(code, viewer)

    // Preset style options are per-device (DEC-42) — persisted per class.
    const [options, setOptions] = useState<ViewportStyleOptions>(() => loadViewportOptions(viewportClass))
    useEffect(() => {
        setOptions(loadViewportOptions(viewportClass))
    }, [viewportClass])
    const updateOptions = useCallback(
        (partial: Partial<ViewportStyleOptions>) => {
            setOptions((prev) => {
                const next = { ...prev, ...partial }
                saveViewportOptions(viewportClass, next)
                return next
            })
        },
        [viewportClass],
    )

    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showToolbar, setShowToolbar] = useState(true)
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
            setIsFullscreen(true)
        } else {
            document.exitFullscreen()
            setIsFullscreen(false)
        }
    }, [])

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', handler)
        return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    // Auto-hide toolbar in fullscreen
    const handleUserActivity = useCallback(() => {
        setShowToolbar(true)
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
        }
        if (isFullscreen) {
            hideTimeoutRef.current = setTimeout(() => {
                setShowToolbar(false)
            }, 3000)
        }
    }, [isFullscreen])

    useEffect(() => {
        if (isFullscreen) {
            document.addEventListener('mousemove', handleUserActivity)
            document.addEventListener('touchstart', handleUserActivity)
            document.addEventListener('keydown', handleUserActivity)
            handleUserActivity() // Start the initial timer
        } else {
            setShowToolbar(true)
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }
        }
        return () => {
            document.removeEventListener('mousemove', handleUserActivity)
            document.removeEventListener('touchstart', handleUserActivity)
            document.removeEventListener('keydown', handleUserActivity)
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
            }
        }
    }, [isFullscreen, handleUserActivity])

    if (error) {
        return <div className={styles.container}>Session not found or connection failed</div>
    }

    if (!session) {
        return <div className={styles.container}>Connecting...</div>
    }

    if (session.status === 'ended') {
        return (
            <div className={styles.container}>
                <div className={styles.ended}>
                    <h2>Session Ended</h2>
                    <p>The worship session has finished.</p>
                </div>
            </div>
        )
    }

    const preset = VIEWPORT_PRESETS[viewportClass]

    return (
        <div className={styles.container} data-testid="viewport-root">
            {/* Floating Toolbar - auto-hides in fullscreen */}
            <div className={`${styles.toolbar} ${showToolbar ? styles.toolbarVisible : styles.toolbarHidden}`}>
                <select
                    className={styles.select}
                    value={viewportClass}
                    onChange={(e) => navigate({ to: '.', search: { type: e.target.value } })}
                    data-testid="viewport-select"
                >
                    {VIEWPORT_CLASSES.map((cls) => (
                        <option key={cls} value={cls}>
                            {VIEWPORT_PRESETS[cls].label}
                        </option>
                    ))}
                </select>
                {preset.shows.chords && (
                    <>
                        <select
                            className={styles.select}
                            value={options.notation}
                            onChange={(e) => updateOptions({ notation: e.target.value })}
                            data-testid="chord-style-select"
                        >
                            {listNotations().map((n) => (
                                <option key={n.id} value={n.id}>
                                    {n.label}
                                </option>
                            ))}
                        </select>
                        <label className={styles.toolbarToggle}>
                            <input
                                type="checkbox"
                                checked={options.showChords}
                                onChange={(e) => updateOptions({ showChords: e.target.checked })}
                            />
                            Chords
                        </label>
                    </>
                )}
                <select
                    className={styles.select}
                    value={options.background}
                    onChange={(e) =>
                        updateOptions({
                            background:
                                e.target.value === 'light' || e.target.value === 'transparent'
                                    ? e.target.value
                                    : 'dark',
                        })
                    }
                >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="transparent">Transparent</option>
                </select>
                <button className={styles.select} onClick={() => updateOptions({ fontScale: Math.max(0.6, options.fontScale - 0.1) })}>
                    A−
                </button>
                <button className={styles.select} onClick={() => updateOptions({ fontScale: Math.min(2.5, options.fontScale + 0.1) })}>
                    A+
                </button>
                <button className={styles.fullscreenBtn} onClick={toggleFullscreen}>
                    {isFullscreen ? '⛶ Exit' : '⛶ Fullscreen'}
                </button>
            </div>

            <ViewportRenderer state={session} viewportClass={viewportClass} options={options} />
        </div>
    )
}
