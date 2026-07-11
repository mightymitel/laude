/**
 * The owner's bespoke song area (WP-150) — a versatile view, not a preset
 * clone. Two modes:
 *  - PLAY: large CURRENT part with chords, a context strip of every part
 *    (each with its LEADING chord), and a NEXT-UP block — the owner is often
 *    also a player and pre-positions on the next opening chord.
 *  - OVERVIEW: the existing full current-song sheet (SongPartsView).
 * Zoom scales THIS panel only. Content comes from the shared primitives —
 * state readers (@laude/session) + @laude/chords rendering — layout is ours,
 * computation is not (the divergence invariant).
 */
import { useCallback, useRef, useState } from 'react'
import type { SessionState } from '@laude/session'
import { effectiveKeyOf, nextPartIndexOf } from '@laude/session'
import { listNotations, transposeKeyName } from '@laude/chords'
import type { ChordStyle, Key, Song } from '@laudasist/shared'
import { firstChordTokenOf } from '@/viewports/ViewportRenderer'
import { formatChordToken, renderLine, stripChordTokens } from '@/viewports/chordLine'
import { asKey, POSSIBLE_KEYS } from '@/lib/keys'
import { SongPartsView, type ChordDisplay } from './SongPartsView'
import styles from './OwnerSongView.module.css'

type ViewMode = 'play' | 'overview'

interface OwnerViewPrefs {
    mode: ViewMode
    zoom: number
    notation: string
    capo: number
}

const PREFS_KEY = 'laudasist.ownerView'
const DEFAULT_PREFS: OwnerViewPrefs = { mode: 'play', zoom: 1, notation: 'english', capo: 0 }

function loadPrefs(): OwnerViewPrefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY)
        const p = raw === null ? {} : (JSON.parse(raw) as Partial<OwnerViewPrefs>)
        return {
            mode: p.mode === 'overview' ? 'overview' : 'play',
            zoom: typeof p.zoom === 'number' && p.zoom >= 0.6 && p.zoom <= 2.2 ? p.zoom : 1,
            notation: typeof p.notation === 'string' ? p.notation : 'english',
            capo:
                typeof p.capo === 'number' && Number.isInteger(p.capo) && p.capo >= 0 && p.capo <= 11
                    ? p.capo
                    : 0,
        }
    } catch {
        return DEFAULT_PREFS
    }
}

interface OwnerSongViewProps {
    state: SessionState
    /** The library fetch — the overview sheet renders this richer shape. */
    librarySong: Song | null
    currentPartIndex: number
    displayKey: Key
    keyPolicy: 'adopt' | 'hold'
    chordStyle: ChordStyle
    chordDisplay: ChordDisplay
    showChords: boolean
    onSelectPart: (index: number) => void
    onDisplayKey: (key: Key) => void
    onChordStyle: (style: ChordStyle) => void
    onChordDisplay: (display: ChordDisplay) => void
    onShowChords: (show: boolean) => void
    onKeyPolicy: (policy: 'adopt' | 'hold') => void
    partRef: (index: number, el: HTMLDivElement | null) => void
}

export function OwnerSongView(props: OwnerSongViewProps) {
    const { state } = props
    const [prefs, setPrefs] = useState<OwnerViewPrefs>(loadPrefs)
    const panelRef = useRef<HTMLDivElement | null>(null)

    const updatePrefs = useCallback((partial: Partial<OwnerViewPrefs>) => {
        setPrefs((prev) => {
            const next = { ...prev, ...partial }
            localStorage.setItem(PREFS_KEY, JSON.stringify(next))
            return next
        })
    }, [])

    const toggleFullscreen = useCallback(() => {
        // WP-148: fullscreen affordance on the owner surface too — the song
        // panel alone goes fullscreen, controls stay behind.
        if (!document.fullscreenElement) void panelRef.current?.requestFullscreen()
        else void document.exitFullscreen()
    }, [])

    // Shared content readers — identical on every client.
    const song = state.currentSong
    const soundingKey = asKey(effectiveKeyOf(state))
    const rawIndex = state.current.section_index
    const currentIndex = typeof rawIndex === 'number' ? rawIndex : -1
    const nextIndex = nextPartIndexOf(state)
    const shapeKey = prefs.capo > 0 ? transposeKeyName(soundingKey, -prefs.capo) : soundingKey

    if (!song) return null

    const currentPart = currentIndex >= 0 ? song.parts[currentIndex] : undefined
    const nextPart = nextIndex !== null ? song.parts[nextIndex] : undefined
    const nextChord = firstChordTokenOf(nextPart)

    return (
        <div className={styles.panel} ref={panelRef} data-testid="owner-song-view">
            <div className={styles.toolbar}>
                <div className={styles.modeSwitch} role="tablist">
                    <button
                        role="tab"
                        aria-selected={prefs.mode === 'play'}
                        className={prefs.mode === 'play' ? styles.modeActive : styles.modeBtn}
                        onClick={() => updatePrefs({ mode: 'play' })}
                    >
                        ▶ Play
                    </button>
                    <button
                        role="tab"
                        aria-selected={prefs.mode === 'overview'}
                        className={prefs.mode === 'overview' ? styles.modeActive : styles.modeBtn}
                        onClick={() => updatePrefs({ mode: 'overview' })}
                        data-testid="owner-mode-overview"
                    >
                        ☰ Overview
                    </button>
                </div>
                <div className={styles.toolbarRight}>
                    <select
                        className={styles.control}
                        value={props.displayKey}
                        onChange={(e) => props.onDisplayKey(asKey(e.target.value))}
                        title="Sounding key — session state, every device follows"
                        data-testid="owner-key-select"
                    >
                        {POSSIBLE_KEYS.map((k) => (
                            <option key={k} value={k}>{k}</option>
                        ))}
                    </select>
                    <select
                        className={styles.control}
                        value={props.keyPolicy}
                        onChange={(e) => props.onKeyPolicy(e.target.value === 'hold' ? 'hold' : 'adopt')}
                        title="On song change: adopt the incoming song's key, or hold this key"
                    >
                        <option value="adopt">Adopt song key</option>
                        <option value="hold">Hold current key</option>
                    </select>
                    {prefs.mode === 'play' && (
                        <select
                            className={styles.control}
                            value={prefs.notation}
                            onChange={(e) => updatePrefs({ notation: e.target.value })}
                            title="Chord notation (this device only)"
                        >
                            {listNotations().map((n) => (
                                <option key={n.id} value={n.id}>{n.label}</option>
                            ))}
                        </select>
                    )}
                    {/* Capo applies in BOTH modes (WP-147) — the owner plays too. */}
                    <select
                        className={styles.control}
                        value={prefs.capo}
                        onChange={(e) => updatePrefs({ capo: Number(e.target.value) })}
                        title="Capo / shape offset — display only; the band still sounds in the session key"
                        data-testid="owner-capo-select"
                    >
                        {Array.from({ length: 12 }, (_, i) => (
                            <option key={i} value={i}>{i === 0 ? 'No capo' : `Capo ${i}`}</option>
                        ))}
                    </select>
                    <button
                        className={styles.control}
                        onClick={() => updatePrefs({ zoom: Math.max(0.6, Math.round((prefs.zoom - 0.1) * 10) / 10) })}
                        title="Zoom out (song panel only)"
                    >
                        A−
                    </button>
                    <button
                        className={styles.control}
                        onClick={() => updatePrefs({ zoom: Math.min(2.2, Math.round((prefs.zoom + 0.1) * 10) / 10) })}
                        title="Zoom in (song panel only)"
                    >
                        A+
                    </button>
                    <button className={styles.control} onClick={toggleFullscreen} title="Fullscreen the song panel">
                        ⛶
                    </button>
                </div>
            </div>

            {prefs.mode === 'overview' ? (
                <div className={styles.overviewScroll} style={{ fontSize: `${prefs.zoom}em` }}>
                    {props.librarySong ? (
                        <SongPartsView
                            song={props.librarySong}
                            currentPartIndex={props.currentPartIndex}
                            displayKey={props.displayKey}
                            capo={prefs.capo}
                            chordStyle={props.chordStyle}
                            chordDisplay={props.chordDisplay}
                            showChords={props.showChords}
                            keyPolicy={props.keyPolicy}
                            onSelectPart={props.onSelectPart}
                            onDisplayKey={props.onDisplayKey}
                            onChordStyle={props.onChordStyle}
                            onChordDisplay={props.onChordDisplay}
                            onShowChords={props.onShowChords}
                            onKeyPolicy={props.onKeyPolicy}
                            partRef={props.partRef}
                        />
                    ) : (
                        <p className={styles.hint}>Loading full sheet…</p>
                    )}
                </div>
            ) : (
                <div className={styles.playArea} style={{ fontSize: `${prefs.zoom}em` }}>
                    {/* Context strip: every part, each with its leading chord */}
                    <div className={styles.contextStrip}>
                        {song.parts.map((part, i) => {
                            const lead = firstChordTokenOf(part)
                            return (
                                <button
                                    key={i}
                                    className={`${styles.contextChip} ${i === currentIndex ? styles.contextChipActive : ''} ${nextIndex === i ? styles.contextChipNext : ''}`}
                                    onClick={() => props.onSelectPart(i)}
                                >
                                    <span className={styles.chipType}>{part.type}</span>
                                    {lead !== null && (
                                        <span className={styles.chipChord}>
                                            {formatChordToken(lead, shapeKey, prefs.notation)}
                                        </span>
                                    )}
                                    <span className={styles.chipSnippet}>
                                        {stripChordTokens(part.lines[0]?.text ?? '')}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {/* CURRENT part, large, with chords */}
                    <div className={styles.currentPart} data-testid="owner-current-part">
                        <div className={styles.currentHeader}>
                            <span className={styles.partLabel}>
                                {currentPart?.type ?? 'instrumental'}
                            </span>
                            <span className={styles.keyBadge}>
                                {soundingKey}
                                {prefs.capo > 0 && ` · capo ${prefs.capo} → ${shapeKey} shapes`}
                            </span>
                        </div>
                        {currentPart?.lines.map((line, i) => {
                            const rendered = renderLine(line.text, shapeKey, prefs.notation)
                            return (
                                <div key={i} className={styles.line}>
                                    {rendered.chordLine !== '' && (
                                        <pre className={styles.chords}>{rendered.chordLine}</pre>
                                    )}
                                    <div className={styles.lyric}>{rendered.text}</div>
                                </div>
                            )
                        })}
                        {!currentPart && <p className={styles.hint}>Instrumental — pick a part to continue.</p>}
                    </div>

                    {/* NEXT-UP with its leading chord (omit-if-empty) */}
                    {nextPart && (
                        <button
                            className={styles.nextUp}
                            onClick={() => nextIndex !== null && props.onSelectPart(nextIndex)}
                            data-testid="owner-next-up"
                        >
                            <span className={styles.nextLabel}>
                                NEXT · {nextPart.type}
                                {nextChord !== null && (
                                    <span className={styles.chipChord}>
                                        {' '}{formatChordToken(nextChord, shapeKey, prefs.notation)}
                                    </span>
                                )}
                            </span>
                            <span className={styles.nextSnippet}>
                                {stripChordTokens(nextPart.lines[0]?.text ?? '')}
                            </span>
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
