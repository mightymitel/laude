/**
 * Validation: compare the extractor's output against a human-made reference
 * chart (melodia.ro), fetched through Laudasist's own scraper API
 * (POST /api/import/preview). Acceptance bar: APPROXIMATE agreement.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getNotation, formatCanonical } from '@laude/chords';
import type { LrcLine } from '@laude/song-model';

const API_URL = process.env.LAUDASIST_API_URL ?? 'http://127.0.0.1:3001';
const AUTH_URL = process.env.FIREBASE_AUTH_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`
  : 'http://127.0.0.1:9099';

interface ManifestSubset {
  title: string;
  key: string;
  lrc: LrcLine[];
  chord_events: { start_s: number; chord: string }[];
}

interface ReferenceSong {
  title: string;
  originalKey: string;
  lines: string[];
  chordCounts: Map<string, number>;
}

export async function validateAgainstReference(
  manifest: ManifestSubset,
  referenceUrl: string,
  work: string,
): Promise<void> {
  console.log(`\nvalidation: fetching reference ${referenceUrl}`);
  const reference = await fetchReference(referenceUrl);

  // --- lyrics: per extracted line, best fuzzy match among reference lines
  const refLines = reference.lines.map(normalizeForCompare).filter((l) => l.length > 0);
  const scores = manifest.lrc.map((line) => {
    const extracted = normalizeForCompare(line.text);
    let best = 0;
    for (const ref of refLines) best = Math.max(best, bigramDice(extracted, ref));
    return { text: line.text, score: best };
  });
  const avg = scores.reduce((s, x) => s + x.score, 0) / Math.max(1, scores.length);
  const good = scores.filter((x) => x.score >= 0.6);

  // --- chords: time-weighted extracted histogram vs reference chord counts
  const extractedWeights = new Map<string, number>();
  for (let i = 0; i < manifest.chord_events.length; i += 1) {
    const ev = manifest.chord_events[i];
    const end = manifest.chord_events[i + 1]?.start_s ?? ev.start_s + 4;
    extractedWeights.set(ev.chord, (extractedWeights.get(ev.chord) ?? 0) + (end - ev.start_s));
  }
  const topExtracted = topKeys(extractedWeights, 5);
  const topReference = topKeys(reference.chordCounts, 5);
  const overlap = topExtracted.filter((c) => topReference.includes(c));
  const keyMatch = normalizeKey(manifest.key) === normalizeKey(reference.originalKey);

  // Charts are often written in a different (singable) key than the recording;
  // the honest comparison is FUNCTIONAL: Nashville degrees relative to each
  // side's own key.
  const degExtracted = toDegrees(topExtracted, manifest.key);
  const degReference = toDegrees(topReference, reference.originalKey);
  const degOverlap = degExtracted.filter((d) => degReference.includes(d));

  const report = {
    reference_url: referenceUrl,
    reference_title: reference.title,
    extracted_title: manifest.title,
    key: { extracted: manifest.key, reference: reference.originalKey, match: keyMatch },
    lyrics: {
      lines_compared: scores.length,
      average_similarity: Number(avg.toFixed(3)),
      lines_above_60pct: `${good.length}/${scores.length}`,
      worst_lines: [...scores].sort((a, b) => a.score - b.score).slice(0, 5),
    },
    chords: {
      top_extracted: topExtracted,
      top_reference: topReference,
      overlap: `${overlap.length}/${Math.min(topExtracted.length, topReference.length)}`,
      degrees_extracted: degExtracted,
      degrees_reference: degReference,
      functional_overlap: `${degOverlap.length}/${Math.min(degExtracted.length, degReference.length)}`,
    },
  };
  writeFileSync(join(work, 'validation.json'), JSON.stringify(report, null, 2));

  console.log('validation report ——————————————');
  console.log(`  title      extracted “${manifest.title}” vs reference “${reference.title}”`);
  console.log(`  key        ${manifest.key} vs ${reference.originalKey} -> ${keyMatch ? 'MATCH' : 'DIFFERENT'}`);
  console.log(`  lyrics     avg similarity ${(avg * 100).toFixed(1)}%, ${good.length}/${scores.length} lines ≥60%`);
  console.log(`  chords     extracted top: ${topExtracted.join(' ')}  (degrees ${degExtracted.join(' ')})`);
  console.log(`             reference top: ${topReference.join(' ')}  (degrees ${degReference.join(' ')})`);
  console.log(`             absolute overlap ${overlap.length}/${Math.min(topExtracted.length, topReference.length)}, functional overlap ${degOverlap.length}/${Math.min(degExtracted.length, degReference.length)}`);
  console.log(`  full report: ${join(work, 'validation.json')}`);
}

async function fetchReference(url: string): Promise<ReferenceSong> {
  const token = await demoToken();
  const res = await fetch(`${API_URL}/api/import/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(`import/preview failed: HTTP ${res.status} ${await res.text()}`);
  }
  const payload: unknown = await res.json();
  return parseReference(payload);
}

function parseReference(payload: unknown): ReferenceSong {
  const root = asRecord(payload);
  const song = asRecord(root.data ?? root.song ?? root);
  // Staging pages leak the key-selector into the scraped h1 — keep the first
  // sane line only.
  const rawTitle = typeof song.title === 'string' ? song.title : '(unknown)';
  const title = rawTitle.split('\n')[0].trim().slice(0, 80) || '(unknown)';
  const originalKey = typeof song.originalKey === 'string' ? song.originalKey : '?';

  const lines: string[] = [];
  const chordCounts = new Map<string, number>();
  const nashville = getNotation('nashville');
  const partsRaw = Array.isArray(song.parts) ? song.parts : [];
  for (const partRaw of partsRaw) {
    const part = asRecord(partRaw);
    const partLines = Array.isArray(part.lines) ? part.lines : [];
    for (const lineRaw of partLines) {
      const line = asRecord(lineRaw);
      const text = typeof line.text === 'string' ? line.text : '';
      lines.push(text.replace(/\[[^\]]*\]/g, ''));
      for (const m of text.matchAll(/\[([^\]]+)\]/g)) {
        const canonical = nashville?.parse(m[1], { key: originalKey });
        const name = canonical ? formatCanonical(canonical) : m[1];
        chordCounts.set(name, (chordCounts.get(name) ?? 0) + 1);
      }
    }
  }
  return { title, originalKey, lines, chordCounts };
}

async function demoToken(): Promise<string> {
  const res = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'demo@laude.local',
        password: 'parola-demo',
        returnSecureToken: true,
      }),
    },
  );
  if (!res.ok) throw new Error(`auth emulator sign-in failed: HTTP ${res.status}`);
  const data = asRecord(await res.json());
  if (typeof data.idToken !== 'string') throw new Error('no idToken in auth response');
  return data.idToken;
}

// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Lowercase, strip diacritics (OCR often loses them), drop punctuation. */
function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): Set<string> {
  const grams = new Set<string>();
  const packed = s.replace(/\s/g, ' ');
  for (let i = 0; i < packed.length - 1; i += 1) grams.add(packed.slice(i, i + 2));
  return grams;
}

/** Sørensen–Dice similarity over character bigrams, 0..1. */
function bigramDice(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let common = 0;
  for (const g of ga) if (gb.has(g)) common += 1;
  return (2 * common) / (ga.size + gb.size);
}

function normalizeKey(key: string): string {
  const enharmonic: Record<string, string> = { 'A#': 'Bb', 'D#': 'Eb', 'G#': 'Ab', 'C#': 'Db', 'F#': 'Gb' };
  const trimmed = key.trim();
  return enharmonic[trimmed] ?? trimmed;
}

/** Chord names -> Nashville degrees relative to a key, e.g. Bb key: Eb -> 4. */
function toDegrees(chords: string[], key: string): string[] {
  const english = getNotation('english');
  const nashville = getNotation('nashville');
  const degrees: string[] = [];
  for (const chord of chords) {
    const canonical = english?.parse(chord);
    const degree = canonical && nashville ? nashville.format(canonical, { key }) : chord;
    if (!degrees.includes(degree)) degrees.push(degree);
  }
  return degrees;
}

function topKeys(counts: Map<string, number>, k: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([name]) => name);
}
