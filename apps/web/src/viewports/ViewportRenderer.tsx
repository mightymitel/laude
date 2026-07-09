/**
 * Renders one viewport preset from live session state: directive handling
 * (blank / freeze / message per declared class), placeholder resolution, and
 * chord lines in the device's notation. Pure render — the page owns the
 * connection and the option persistence.
 */
import { useRef } from 'react'
import type { SessionState, ViewportDirectives } from '@laude/session'
import { DEFAULT_VIEWPORT_DIRECTIVES, partIndexFor } from '@laude/session'
import { asKey } from '@/lib/keys'
import type { ViewportClass, ViewportStyleOptions } from './contract'
import { VIEWPORT_PRESETS } from './presets'
import { renderLine, stripChordTokens } from './chordLine'
import styles from './viewport.module.css'

/** Directive self-selection: the whole map arrives; we obey our class only. */
export function directivesFor(state: SessionState, cls: ViewportClass): ViewportDirectives {
  return { ...DEFAULT_VIEWPORT_DIRECTIVES, ...state.directives[cls] }
}

interface RenderSlice {
  song: NonNullable<SessionState['currentSong']>
  /** Part index, or 'instrumental' — a first-class value (DEC-62). */
  partIndex: number | 'instrumental'
  displayKey: string
}

function sliceOf(state: SessionState): RenderSlice | null {
  if (!state.currentSong || state.current.song_id === null) return null
  return {
    song: state.currentSong,
    partIndex: state.current.section_index,
    displayKey: asKey(state.current.key ?? state.currentSong.defaultKey),
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
  // The last NUMERIC part, so instrumental can render "what's next" (stage)
  // and hold the chords (instrument) — DEC-62 rendering rules.
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
    // TRUTH over heuristic (WP-117): a driving DJ announces its actual next
    // mapped part; only when absent fall back to "last announced + 1".
    const nextRef = state.current.next_part
    const truthIdx = nextRef ? partIndexFor(song.parts, nextRef) : null
    const upNext =
      (truthIdx !== null ? song.parts[truthIdx] : undefined) ??
      song.parts[lastNumericPartRef.current + 1]
    if (viewportClass === 'stage') {
      return (
        <div className={`${styles.viewport} ${styles[options.background]}`}>
          <main className={styles.body} style={{ fontSize: `${1.6 * options.fontScale}rem` }}>
            <span className={styles.partLabel} data-testid="instrumental">instrumental</span>
            {upNext && (
              <div className={styles.nextPart}>
                <span className={styles.nextLabel}>Next: {upNext.type}</span>
                {upNext.lines.slice(0, 2).map((line, i) => (
                  <div key={i}>{stripChordTokens(line.text)}</div>
                ))}
              </div>
            )}
          </main>
        </div>
      )
    }
    // instrument: hold the last part's chart through the instrumental break.
  }

  const partIndex =
    typeof slice.partIndex === 'number' ? slice.partIndex : lastNumericPartRef.current
  const part = song.parts[partIndex]
  const next = song.parts[partIndex + 1]

  if (preset.shows.oneLine) {
    // Subtitles: minimal single-line output (authored renderer deferred).
    const line = part?.lines[0] ? stripChordTokens(part.lines[0].text) : ''
    return (
      <div className={`${styles.viewport} ${styles[options.background]} ${styles.subtitles}`}>
        <span style={{ fontSize: `${2 * options.fontScale}rem` }}>{line}</span>
      </div>
    )
  }

  return (
    <div className={`${styles.viewport} ${styles[options.background]}`}>
      <header className={styles.header}>
        <span className={styles.songTitle} data-testid="song-title">{song.title}</span>
        <span className={styles.meta}>
          {song.author ? `${song.author} • ` : ''}Key: {displayKey}
        </span>
      </header>
      <main className={styles.body} style={{ fontSize: `${1.6 * options.fontScale}rem` }}>
        {part && (
          <>
            <span className={styles.partLabel}>
              {part.type}
              {slice.partIndex === 'instrumental' ? ' · instrumental' : ''}
            </span>
            {part.lines.map((line, i) => {
              const rendered = renderLine(line.text, displayKey, options.notation)
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
            <span className={styles.nextLabel}>Next: {next.type}</span>
            {next.lines.slice(0, 2).map((line, i) => (
              <div key={i}>{stripChordTokens(line.text)}</div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
