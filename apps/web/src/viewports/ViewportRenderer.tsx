/**
 * Renders one viewport preset from live session state: directive handling
 * (blank / freeze / message per declared class), placeholder resolution, and
 * chord lines in the device's notation. Pure render — the page owns the
 * connection and the option persistence.
 *
 * Content vs rendering (the divergence invariant): WHAT is shown — current
 * part, lyrics, chords-as-degrees, the sounding effective_key, the next part
 * — comes from the shared readers (@laude/session) and @laude/chords. HOW it
 * is laid out — metadata chrome, capo shapes, fit scaling, fonts — is
 * per-device and free to differ.
 */
import { useRef, type ReactNode } from 'react'
import type { SessionState, ViewportDirectives } from '@laude/session'
import { DEFAULT_VIEWPORT_DIRECTIVES, effectiveKeyOf, nextPartIndexOf } from '@laude/session'
import { transposeKeyName } from '@laude/chords'
import { asKey } from '@/lib/keys'
import type { ViewportClass, ViewportStyleOptions } from './contract'
import { VIEWPORT_PRESETS } from './presets'
import { formatChordToken, renderLine, stripChordTokens } from './chordLine'
import { FitBox } from './FitBox'
import styles from './viewport.module.css'

/** Directive self-selection: the whole map arrives; we obey our class only. */
export function directivesFor(state: SessionState, cls: ViewportClass): ViewportDirectives {
  return { ...DEFAULT_VIEWPORT_DIRECTIVES, ...state.directives[cls] }
}

/** The first chord token of a part, or null for a lyrics-only part —
 * omit-if-empty (WP-151): a musician pre-positions on it before the switch. */
export function firstChordTokenOf(part: { lines: { text: string }[] } | undefined): string | null {
  if (!part) return null
  for (const line of part.lines) {
    const m = /\[([^\]]+)\]/.exec(line.text)
    if (m && m[1] !== undefined && !/\s/.test(m[1])) return m[1]
  }
  return null
}

interface RenderSlice {
  song: NonNullable<SessionState['currentSong']>
  /** Part index, or 'instrumental' — a first-class value (DEC-62). */
  partIndex: number | 'instrumental'
  displayKey: string
  nextIndex: number | null
}

function sliceOf(state: SessionState): RenderSlice | null {
  if (!state.currentSong || state.current.song_id === null) return null
  return {
    song: state.currentSong,
    partIndex: state.current.section_index,
    // The broadcast sounding key via the shared reader (WP-144) — never a
    // per-client derivation.
    displayKey: asKey(effectiveKeyOf(state)),
    // The shared next-part reader (announced truth, else current+1).
    nextIndex: nextPartIndexOf(state),
  }
}

export function ViewportRenderer({
  state,
  viewportClass,
  options,
}: {
  state: SessionState
  viewportClass: ViewportClass
  options: ViewportStyleOptions
}) {
  const preset = VIEWPORT_PRESETS[viewportClass]
  const directives = directivesFor(state, viewportClass)

  // FREEZE holds the last rendered slice; live updates keep flowing past us.
  const frozenRef = useRef<RenderSlice | null>(null)
  // The last NUMERIC part, so instrumental can hold the chords (instrument
  // class) — DEC-62 rendering rules.
  const lastNumericPartRef = useRef(0)
  const liveSlice = sliceOf(state)
  if (liveSlice && typeof liveSlice.partIndex === 'number') {
    lastNumericPartRef.current = liveSlice.partIndex
  }
  if (!directives.freeze) {
    frozenRef.current = liveSlice
  }
  const slice = directives.freeze ? (frozenRef.current ?? liveSlice) : liveSlice

  if (directives.blank) {
    return <div className={`${styles.viewport} ${styles[options.background]} ${styles.blank}`} />
  }

  if (directives.message !== null && directives.message !== '') {
    return (
      <div className={`${styles.viewport} ${styles[options.background]}`}>
        <div className={styles.message} style={{ fontSize: `${2.4 * options.fontScale}rem` }}>
          {directives.message}
        </div>
      </div>
    )
  }

  if (!slice) {
    return (
      <div className={`${styles.viewport} ${styles[options.background]}`}>
        <div className={styles.waiting}>Waiting for the presenter…</div>
      </div>
    )
  }

  const { song, displayKey } = slice
  const showChords = preset.shows.chords && options.showChords
  // Capo (WP-147): shapes render for the offset key; the SOUNDING key is
  // untouched session state and stays visible while an offset is active.
  const capo = preset.shows.chords ? options.capo : 0
  const shapeKey = capo > 0 ? transposeKeyName(displayKey, -capo) : displayKey

  // Projection & instrument surfaces show no song metadata (WP-152) — the
  // {{song_title}}/{{author}} placeholders stay in the contract for custom
  // templates; this is a per-preset rendering choice, no version bump.
  const showMetadata = viewportClass === 'stage'
  const capoBar =
    capo > 0 ? (
      <div className={styles.capoBar} data-testid="capo-indicator">
        Key {displayKey} · Capo {capo} → {shapeKey} shapes
      </div>
    ) : null

  const fitKeyOf = (partIdx: number | 'instrumental'): string =>
    [song.id, partIdx, displayKey, capo, options.notation, showChords, options.fontScale, viewportClass].join('|')

  const wrap = (partIdx: number | 'instrumental', content: ReactNode): ReactNode =>
    options.fitToScreen ? <FitBox fitKey={fitKeyOf(partIdx)}>{content}</FitBox> : content

  // INSTRUMENTAL (DEC-62): each class renders it by its own rule —
  // main goes dark · subtitles go empty · stage shows "instrumental · next" ·
  // instrument keeps the chords of the last announced part.
  if (slice.partIndex === 'instrumental') {
    if (viewportClass === 'main') {
      return <div className={`${styles.viewport} ${styles[options.background]} ${styles.blank}`} />
    }
    if (preset.shows.oneLine) {
      return <div className={`${styles.viewport} ${styles[options.background]} ${styles.subtitles}`} />
    }
    if (viewportClass === 'stage') {
      const upNext = slice.nextIndex !== null ? song.parts[slice.nextIndex] : undefined
      const nextChord = firstChordTokenOf(upNext)
      return (
        <div className={`${styles.viewport} ${styles[options.background]}`}>
          {capoBar}
          {wrap(
            'instrumental',
            <main className={styles.body} style={{ fontSize: `${1.6 * options.fontScale}rem` }}>
              <span className={styles.partLabel} data-testid="instrumental">instrumental</span>
              {upNext && (
                <div className={styles.nextPart}>
                  <span className={styles.nextLabel}>
                    Next: {upNext.type}
                    {nextChord !== null && (
                      <span className={styles.nextChord} data-testid="next-chord">
                        {' '}· {formatChordToken(nextChord, shapeKey, options.notation)}
                      </span>
                    )}
                  </span>
                  {upNext.lines.slice(0, 2).map((line, i) => (
                    <div key={i}>{stripChordTokens(line.text)}</div>
                  ))}
                </div>
              )}
            </main>,
          )}
        </div>
      )
    }
    // instrument: hold the last part's chart through the instrumental break.
  }

  const partIndex =
    typeof slice.partIndex === 'number' ? slice.partIndex : lastNumericPartRef.current
  const part = song.parts[partIndex]
  const next =
    typeof slice.partIndex === 'number' && slice.nextIndex !== null
      ? song.parts[slice.nextIndex]
      : song.parts[partIndex + 1]

  if (preset.shows.oneLine) {
    // Subtitles: minimal single-line output (authored renderer deferred).
    const line = part?.lines[0] ? stripChordTokens(part.lines[0].text) : ''
    return (
      <div className={`${styles.viewport} ${styles[options.background]} ${styles.subtitles}`}>
        <span style={{ fontSize: `${2 * options.fontScale}rem` }}>{line}</span>
      </div>
    )
  }

  // Stage pre-positions on the next part's LEADING chord (WP-151, always on).
  const nextChord = viewportClass === 'stage' ? firstChordTokenOf(next) : null

  return (
    <div className={`${styles.viewport} ${styles[options.background]}`}>
      {showMetadata && (
        <header className={styles.header}>
          <span className={styles.songTitle} data-testid="song-title">{song.title}</span>
          <span className={styles.meta}>
            {song.author ? `${song.author} • ` : ''}Key: {displayKey}
          </span>
        </header>
      )}
      {capoBar}
      {wrap(
        partIndex,
        <main className={styles.body} style={{ fontSize: `${1.6 * options.fontScale}rem` }}>
          {part && (
            <>
              <span className={styles.partLabel}>
                {part.type}
                {slice.partIndex === 'instrumental' ? ' · instrumental' : ''}
              </span>
              {part.lines.map((line, i) => {
                const rendered = renderLine(line.text, shapeKey, options.notation)
                return (
                  <div key={i} className={styles.line}>
                    {showChords && rendered.chordLine !== '' && (
                      <pre className={styles.chords}>{rendered.chordLine}</pre>
                    )}
                    <div>{rendered.text}</div>
                  </div>
                )
              })}
            </>
          )}
          {preset.shows.nextPart && next && (
            <div className={styles.nextPart}>
              <span className={styles.nextLabel}>
                Next: {next.type}
                {nextChord !== null && (
                  <span className={styles.nextChord} data-testid="next-chord">
                    {' '}· {formatChordToken(nextChord, shapeKey, options.notation)}
                  </span>
                )}
              </span>
              {next.lines.slice(0, 2).map((line, i) => (
                <div key={i}>{stripChordTokens(line.text)}</div>
              ))}
            </div>
          )}
        </main>,
      )}
    </div>
  )
}
