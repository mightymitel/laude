/**
 * THE shared rendering core (WP-165 / DEC-141/142/147). One pure function
 * family: (song model, render options) → layout. No interaction, no chrome,
 * no React. Surfaces compose layers on top:
 *   editor      → interaction / hit targets / drag handles (WP-166)
 *   viewports   → fit + presets (WP-144–152)
 *   song view   → metadata chrome (presenting surfaces show none, DEC-122)
 *
 * RENDER-BY-PART (DEC-147): parts are canonical and laid out ONCE; an
 * arrangement is an ordered list of part REFS (repeats allowed). The layout
 * exposes `parts` + a `sequence` of refs — consumers reuse the rendered
 * part per occurrence and never pre-render the whole performance.
 *
 * CHORD SPELLING stays two delegated engines, characterized by WP-164's
 * goldens: ChordStyle formatting (@laudasist/shared, VALIDATED tokenizer —
 * an unparseable token stays in the text) and notation-id formatting
 * (@laude/chords, GREEDY tokenizer — any [..] token lands on the chord row
 * with fallback). Unifying their spellings would silently change captured
 * output; that is a later, explicitly-reviewed change.
 */
import {
    extractChordsFromLine,
    formatChord,
    type ChordStyle,
    type Key,
    type NashvilleChord,
    type Song,
    type SongPart,
} from '@laudasist/shared'
import { getNotation, parseChordInKey, transposeKeyName } from '@laude/chords'

// --- chord format: which spelling engine + tokenizer semantics ---

export type ChordFormat =
    | { kind: 'style'; style: ChordStyle }
    | { kind: 'notation'; id: string }

export interface LayoutChord {
    /** Character offset into the clean lyric text the chord sits BEFORE. */
    charIndex: number
    /** Spelled for display in the requested format + key. */
    display: string
    /** The raw stored token (degree or legacy letter), brackets stripped. */
    token: string
}

export interface LayoutLine {
    /** Lyric text with chord tokens removed. */
    text: string
    chords: LayoutChord[]
}

export interface LayoutPart {
    id: string
    type: SongPart['type']
    index: number
    lines: LayoutLine[]
}

export interface PartOccurrence {
    /** Index into SongLayout.parts. */
    part: number
    /** 1-based occurrence of this part within the sequence (repeats). */
    occurrence: number
    /** The arrangement ref that produced it ('' in compact view). */
    ref: string
}

export interface SongLayout {
    parts: LayoutPart[]
    /** Performance order: refs into `parts`. Compact view = each part once. */
    sequence: PartOccurrence[]
    /** The key chords are spelled in (shape key when capo > 0). */
    renderKey: string
    /** The sounding key the options asked for. */
    soundingKey: string
}

export interface RenderOptions {
    /** The sounding key. */
    key: string
    /** Capo / shape offset — chords spell in transposeKeyName(key, -capo). */
    capo?: number
    format: ChordFormat
    showChords?: boolean
    /** compact = each part once (lead sheet); arrangement = performance order. */
    view?: 'compact' | 'arrangement'
    /** Explicit arrangement order (part refs); defaults to the song's own. */
    arrangement?: string[]
}

// --- line layout ---

function spellStyle(chord: NashvilleChord, key: string, style: ChordStyle): string {
    return formatChord(chord, keyOf(key), style)
}

const KEY_NAMES: readonly Key[] = [
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
]

function keyOf(key: string): Key {
    // The core accepts plain strings (session keys travel as strings);
    // narrow honestly, C fallback like the app-wide asKey.
    return KEY_NAMES.find((k) => k === key) ?? 'C'
}

const GREEDY_TOKEN = /\[([^\]]+)\]/g

/** Spell one raw token in a notation (greedy engine, fallback = raw token). */
export function spellToken(token: string, key: string, notationId: string): string {
    const canonical = parseChordInKey(token, key)
    if (canonical === null) return token
    const notation = getNotation(notationId) ?? getNotation('english')!
    return notation.format(canonical, { key })
}

/** Lay out ONE stored lyric line in the requested chord format. */
export function layoutLine(rawLine: string, renderKey: string, format: ChordFormat): LayoutLine {
    if (format.kind === 'style') {
        // VALIDATED tokenizer: exactly extractChordsFromLine's semantics —
        // unparseable tokens remain part of the lyric text (engine A).
        const { text, chords } = extractChordsFromLine(rawLine)
        return {
            text,
            chords: chords
                .map((c) => ({
                    charIndex: c.index,
                    display: spellStyle(c.chord, renderKey, format.style),
                    // The stable token is the nashville spelling of the degree.
                    token: spellStyle(c.chord, renderKey, 'nashville'),
                }))
                .sort((a, b) => a.charIndex - b.charIndex),
        }
    }
    // GREEDY tokenizer: any bracketed token is a chord (engine B).
    let text = ''
    const chords: LayoutChord[] = []
    let lastIndex = 0
    GREEDY_TOKEN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = GREEDY_TOKEN.exec(rawLine)) !== null) {
        text += rawLine.slice(lastIndex, match.index)
        chords.push({
            charIndex: text.length,
            display: spellToken(match[1]!, renderKey, format.id),
            token: match[1]!,
        })
        lastIndex = match.index + match[0].length
    }
    text += rawLine.slice(lastIndex)
    return { text, chords }
}

// --- part refs & sequence (DEC-147: arrangement = ordered part refs) ---

const REF_LETTER: Record<string, SongPart['type']> = {
    V: 'verse',
    C: 'chorus',
    B: 'bridge',
    P: 'pre-chorus',
    I: 'intro',
    O: 'outro',
    T: 'tag',
}

/** Resolve an arrangement ref ("V1", "C1", "B1"…) to a parts index. */
export function refToPartIndex(parts: readonly SongPart[], ref: string): number | null {
    const m = /^([A-Za-z]+)(\d*)$/.exec(ref.trim())
    if (!m) return null
    const type = REF_LETTER[m[1]!.toUpperCase().charAt(0)]
    if (!type) return null
    const wanted = m[2] === '' ? 1 : Number(m[2])
    let seen = 0
    for (const [i, part] of parts.entries()) {
        if (part.type !== type) continue
        seen += 1
        // Match by the part's own index when set, else by occurrence order.
        if (part.index === wanted || (part.index === 0 && seen === wanted)) return i
        if (seen === wanted && !parts.some((p) => p.type === type && p.index === wanted)) return i
    }
    return null
}

/** The performance order for a song + view. Unresolvable refs are skipped. */
export function sequenceOf(
    parts: readonly SongPart[],
    view: 'compact' | 'arrangement',
    arrangement?: readonly string[],
): PartOccurrence[] {
    if (view === 'compact' || !arrangement || arrangement.length === 0) {
        return parts.map((_, i) => ({ part: i, occurrence: 1, ref: '' }))
    }
    const counts = new Map<number, number>()
    const seq: PartOccurrence[] = []
    for (const ref of arrangement) {
        const idx = refToPartIndex(parts, ref)
        if (idx === null) continue
        const n = (counts.get(idx) ?? 0) + 1
        counts.set(idx, n)
        seq.push({ part: idx, occurrence: n, ref })
    }
    // An arrangement that resolves to nothing degrades to compact — never
    // render an empty song because refs drifted.
    return seq.length > 0 ? seq : parts.map((_, i) => ({ part: i, occurrence: 1, ref: '' }))
}

/** The song's own arrangement order, when it has one. */
export function officialArrangementOf(song: Song): string[] | undefined {
    if (song.defaultArrangement && song.defaultArrangement.length > 0) return song.defaultArrangement
    const marked = song.arrangements?.find((a) => a.isDefault)
    return marked && marked.order.length > 0 ? marked.order : undefined
}

// --- the core entry point ---

export function layoutSong(song: Song, options: RenderOptions): SongLayout {
    const capo = options.capo ?? 0
    const renderKey = capo > 0 ? transposeKeyName(options.key, -capo) : options.key
    const showChords = options.showChords ?? true
    const parts: LayoutPart[] = song.parts.map((part, i) => ({
        id: part.id || `part-${i}`,
        type: part.type,
        index: part.index,
        lines: part.lines.map((line) =>
            showChords
                ? layoutLine(line.text, renderKey, options.format)
                : { text: layoutLine(line.text, renderKey, options.format).text, chords: [] },
        ),
    }))
    return {
        parts,
        sequence: sequenceOf(
            song.parts,
            options.view ?? 'compact',
            options.arrangement ?? officialArrangementOf(song),
        ),
        renderKey,
        soundingKey: options.key,
    }
}

// --- adapters: EXACT reproductions of the pre-core consumer shapes,
//     characterized by WP-164's goldens ---

export interface SegmentChordShape {
    index: number
    display: string
    originalChord: string
    chordIndex: number
}
export interface SegmentShape {
    text: string
    chords: SegmentChordShape[]
    startIndex: number
}

/** Engine A's segment shape (song view / editor): split at chord offsets. */
export function lineToSegments(
    rawLine: string,
    renderKey: string,
    style: ChordStyle,
): { pureText: string; segments: SegmentShape[] } {
    const { text, chords } = extractChordsFromLine(rawLine)
    const formatted: SegmentChordShape[] = chords
        .map((c, i) => ({
            index: c.index,
            display: spellStyle(c.chord, renderKey, style),
            originalChord: spellStyle(c.chord, renderKey, 'nashville'),
            chordIndex: i,
        }))
        .sort((a, b) => a.index - b.index)

    const byIndex = new Map<number, SegmentChordShape[]>()
    for (const c of formatted) {
        if (!byIndex.has(c.index)) byIndex.set(c.index, [])
        byIndex.get(c.index)!.push(c)
    }
    const segs: SegmentShape[] = []
    const indices = [...byIndex.keys()].sort((a, b) => a - b)
    if (indices.length > 0 && indices[0]! > 0) {
        segs.push({ text: text.substring(0, indices[0]), chords: [], startIndex: 0 })
    } else if (formatted.length === 0) {
        segs.push({ text, chords: [], startIndex: 0 })
    }
    indices.forEach((index, i) => {
        const next = i < indices.length - 1 ? indices[i + 1]! : text.length
        segs.push({
            text: text.substring(index, Math.min(next, text.length)),
            chords: byIndex.get(index) ?? [],
            startIndex: index,
        })
    })
    return { pureText: text, segments: segs }
}

/** Engine B's monospace pair (viewports / owner Play): chords row + text. */
export function lineToMonospacePair(
    rawLine: string,
    renderKey: string,
    notationId: string,
): { chordLine: string; text: string } {
    const line = layoutLine(rawLine, renderKey, { kind: 'notation', id: notationId })
    let chordRow = ''
    for (const chord of line.chords) {
        const pad = Math.max(0, chord.charIndex - chordRow.length)
        chordRow += ' '.repeat(pad) + chord.display + ' '
    }
    return { chordLine: chordRow.trimEnd(), text: line.text }
}
