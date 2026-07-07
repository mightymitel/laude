/**
 * Notation registry. A notation is a bidirectional adapter (format/parse)
 * between canonical chords and a display spelling. Built-ins: English, German,
 * solfège (Do-Re-Mi), Nashville. User-defined notations are mapping tables
 * validated for invertibility.
 */
import {
  CanonicalChord,
  FLAT_NAMES,
  PitchClass,
  SHARP_NAMES,
  keyIsMinor,
  keyRootPc,
} from './canonical';

export interface NotationContext {
  /** Current key (canonical English, e.g. "G", "Em") — required by Nashville. */
  key?: string;
}

export interface Notation {
  id: string;
  /** Display label, already bilingual-safe (proper nouns). */
  label: string;
  builtIn: boolean;
  format(chord: CanonicalChord, ctx?: NotationContext): string;
  parse(token: string, ctx?: NotationContext): CanonicalChord | null;
}

/** Mapping-table definition for built-in and user-defined notations. */
export interface NotationDef {
  id: string;
  label: string;
  /** 12 note names, sharp spellings (index = pitch class). */
  sharp: string[];
  /** 12 note names, flat spellings; defaults to `sharp`. */
  flat?: string[];
}

export interface NotationValidationError {
  code: 'length' | 'empty' | 'ambiguous';
  message: string;
}

/** A user mapping must be invertible: 12 names per row, none empty, no duplicates across spellings. */
export function validateNotationDef(def: NotationDef): NotationValidationError[] {
  const errors: NotationValidationError[] = [];
  for (const [row, names] of [['sharp', def.sharp], ['flat', def.flat ?? def.sharp]] as const) {
    if (names.length !== 12) {
      errors.push({ code: 'length', message: `${row} row needs exactly 12 note names, got ${names.length}` });
      continue;
    }
    names.forEach((n, i) => {
      if (!n.trim()) errors.push({ code: 'empty', message: `${row}[${i}] is empty` });
    });
  }
  const seen = new Map<string, number>();
  const all = [...def.sharp, ...(def.flat ?? [])];
  all.forEach((n, i) => {
    const pc = i % 12;
    const prev = seen.get(n);
    if (prev !== undefined && prev !== pc) {
      errors.push({ code: 'ambiguous', message: `"${n}" maps to two different notes — not invertible` });
    }
    seen.set(n, pc);
  });
  return errors;
}

function createMappedNotation(def: NotationDef, builtIn = false): Notation {
  const sharp = def.sharp;
  const flat = def.flat ?? def.sharp;
  // Longest-first token table so "Do#" wins over "Do".
  const table = [...new Set([...sharp, ...flat])]
    .map((name) => ({ name, pc: (sharp.indexOf(name) >= 0 ? sharp.indexOf(name) : flat.indexOf(name)) as PitchClass }))
    .sort((a, b) => b.name.length - a.name.length);

  const noteFor = (pc: PitchClass, accidental: 'sharp' | 'flat') =>
    accidental === 'flat' ? flat[pc] : sharp[pc];

  return {
    id: def.id,
    label: def.label,
    builtIn,
    format(chord) {
      const root = noteFor(chord.root, chord.accidental);
      const bass = chord.bass === undefined ? '' : `/${noteFor(chord.bass, chord.accidental)}`;
      return `${root}${chord.quality}${bass}`;
    },
    parse(token) {
      const trimmed = token.trim();
      const [head, bassRaw] = splitBass(trimmed);
      const hit = table.find((t) => head.startsWith(t.name));
      if (!hit) return null;
      const quality = head.slice(hit.name.length);
      let bass: PitchClass | undefined;
      if (bassRaw) {
        const bassHit = table.find((t) => bassRaw === t.name);
        if (!bassHit) return null;
        bass = bassHit.pc;
      }
      const accidental: 'sharp' | 'flat' =
        flat[hit.pc] !== sharp[hit.pc] && head.startsWith(flat[hit.pc]) ? 'flat' : 'sharp';
      return { root: hit.pc, quality, bass, accidental };
    },
  };
}

function splitBass(token: string): [string, string | null] {
  const idx = token.indexOf('/');
  return idx === -1 ? [token, null] : [token.slice(0, idx), token.slice(idx + 1)];
}

// ---------------------------------------------------------------------------
// Built-ins
// ---------------------------------------------------------------------------

export const englishNotation = createMappedNotation(
  { id: 'english', label: 'C D E (English)', sharp: [...SHARP_NAMES], flat: [...FLAT_NAMES] },
  true,
);

export const germanNotation = createMappedNotation(
  {
    id: 'german',
    label: 'C D E … H (German)',
    sharp: ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H'],
    flat: ['C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'],
  },
  true,
);

export const solfegeNotation = createMappedNotation(
  {
    id: 'solfege',
    label: 'Do Re Mi (solfegiu)',
    sharp: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
    flat: ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'],
  },
  true,
);

/** Nashville: relative to the current key's major scale. Degrees with quality suffixes. */
const NASHVILLE_DEGREES = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

export const nashvilleNotation: Notation = {
  id: 'nashville',
  label: 'Nashville (1 4 5)',
  builtIn: true,
  format(chord, ctx) {
    const keyPc = ctx?.key ? keyRootPc(ctx.key) : null;
    if (keyPc === null || keyPc === undefined) return `?${chord.quality}`;
    const rel = (((chord.root - keyPc) % 12) + 12) % 12;
    const bass =
      chord.bass === undefined ? '' : `/${NASHVILLE_DEGREES[(((chord.bass - keyPc) % 12) + 12) % 12]}`;
    return `${NASHVILLE_DEGREES[rel]}${chord.quality}${bass}`;
  },
  parse(token, ctx) {
    const keyPc = ctx?.key ? keyRootPc(ctx.key) : null;
    if (keyPc === null || keyPc === undefined) return null;
    const [head, bassRaw] = splitBass(token.trim());
    const m = head.match(/^(b?#?[1-7])(.*)$/);
    if (!m) return null;
    const rel = NASHVILLE_DEGREES.indexOf(m[1]);
    if (rel === -1) return null;
    let bass: PitchClass | undefined;
    if (bassRaw) {
      const relBass = NASHVILLE_DEGREES.indexOf(bassRaw);
      if (relBass === -1) return null;
      bass = ((keyPc + relBass) % 12) as PitchClass;
    }
    return {
      root: ((keyPc + rel) % 12) as PitchClass,
      quality: m[2],
      bass,
      accidental: 'sharp',
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, Notation>(
  [englishNotation, germanNotation, solfegeNotation, nashvilleNotation].map((n) => [n.id, n]),
);

export function listNotations(): Notation[] {
  return [...registry.values()];
}

export function getNotation(id: string): Notation | undefined {
  return registry.get(id);
}

/** Register a user-defined notation from a mapping table. Throws on non-invertible mappings. */
export function registerNotation(def: NotationDef): Notation {
  const errors = validateNotationDef(def);
  if (errors.length > 0) {
    throw new Error(`Invalid notation "${def.id}": ${errors.map((e) => e.message).join('; ')}`);
  }
  const notation = createMappedNotation(def, false);
  registry.set(notation.id, notation);
  return notation;
}

/** Convenience: canonical English symbol → CanonicalChord (used for stored data). */
export function parseCanonical(symbol: string): CanonicalChord | null {
  return englishNotation.parse(symbol);
}

/** Convenience: CanonicalChord → canonical English symbol. */
export function formatCanonical(chord: CanonicalChord): string {
  return englishNotation.format(chord);
}

export function isMinorKey(key: string): boolean {
  return keyIsMinor(key);
}
