import type { ChordStyle, Key, Song } from '@laudasist/shared'
import { transposeKeyName } from '@laude/chords'
import { SongLine } from '@/components/songs/SongLine'
import { asChordStyle, asKey, POSSIBLE_KEYS } from '@/lib/keys'
import styles from '../../routes/session.module.css'

export type ChordDisplay = 'above' | 'inline' | 'compact'

export function asChordDisplay(value: string): ChordDisplay {
    return value === 'inline' || value === 'compact' ? value : 'above'
}

interface SongPartsViewProps {
    song: Song
    currentPartIndex: number
    displayKey: Key
    chordStyle: ChordStyle
    chordDisplay: ChordDisplay
    showChords: boolean
    keyPolicy: 'adopt' | 'hold'
    /** Capo / shape offset (WP-147) — display only; the key select stays the sounding key. */
    capo?: number
    onSelectPart: (index: number) => void
    onDisplayKey: (key: Key) => void
    onChordStyle: (style: ChordStyle) => void
    onChordDisplay: (display: ChordDisplay) => void
    onShowChords: (show: boolean) => void
    onKeyPolicy: (policy: 'adopt' | 'hold') => void
    partRef: (index: number, el: HTMLDivElement | null) => void
}

/** The song header controls + clickable parts list (main panel of /session). */
export function SongPartsView(props: SongPartsViewProps) {
    const { song, currentPartIndex, displayKey, chordStyle, chordDisplay, showChords } = props
    // Chords render in capo SHAPES; the badge keeps the sounding key visible.
    const capo = props.capo ?? 0
    const shapeKey = capo > 0 ? asKey(transposeKeyName(displayKey, -capo)) : displayKey

    return (
        <>
            <div className={styles.songHeader} data-testid="song-header">
                <h2>
                    {song.title}
                    {capo > 0 && (
                        <span className={styles.capoBadge}>
                            {displayKey} · capo {capo} → {shapeKey} shapes
                        </span>
                    )}
                </h2>
                <div className={styles.controls}>
                    <select value={displayKey} onChange={(e) => props.onDisplayKey(asKey(e.target.value))} className={styles.select}>
                        {POSSIBLE_KEYS.map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                    <select value={chordStyle} onChange={(e) => props.onChordStyle(asChordStyle(e.target.value))} className={styles.select}>
                        <option value="letters">Letters (Am)</option>
                        <option value="caseSensitive">Case (a)</option>
                        <option value="nashville">Nashville</option>
                        <option value="roman">Roman</option>
                    </select>
                    <select
                        value={chordDisplay}
                        onChange={(e) => props.onChordDisplay(asChordDisplay(e.target.value))}
                        className={styles.select}
                    >
                        <option value="above">Chords Above</option>
                        <option value="inline">Inline</option>
                        <option value="compact">Compact (End)</option>
                    </select>
                    <label className={styles.toggle}>
                        <input type="checkbox" checked={showChords} onChange={(e) => props.onShowChords(e.target.checked)} />
                        Show Chords
                    </label>
                    <label className={styles.toggle} title="On song change: adopt the incoming song's key, or hold the current key and transpose the song into it">
                        <select
                            className={styles.select}
                            value={props.keyPolicy}
                            onChange={(e) => props.onKeyPolicy(e.target.value === 'hold' ? 'hold' : 'adopt')}
                        >
                            <option value="adopt">Adopt song key</option>
                            <option value="hold">Hold current key</option>
                        </select>
                    </label>
                </div>
            </div>

            <div className={styles.partsContainer}>
                {song.parts.map((part, index) => (
                    <div
                        key={index}
                        ref={(el) => props.partRef(index, el)}
                        className={`${styles.part} ${index === currentPartIndex ? styles.activePart : ''}`}
                        onClick={() => props.onSelectPart(index)}
                    >
                        <div className={styles.partLabel}>
                            {part.type} {part.index > 0 ? part.index : ''}
                        </div>
                        <div className={styles.partContent}>
                            {part.lines.map((line, lid) => (
                                <SongLine
                                    key={lid}
                                    text={line.text}
                                    displayKey={shapeKey}
                                    chordStyle={chordStyle}
                                    showChords={showChords}
                                    chordPosition={chordDisplay}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </>
    )
}
