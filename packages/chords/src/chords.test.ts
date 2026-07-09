/** Degree-storage tests (DEC-45). Run: npm test -w packages/chords */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertChordPro, parseChordInKey, renderChordPro, transposeKeyName } from './chordpro';
import { formatCanonical, isDegreeToken, nashvilleNotation } from './notations';

test('degree tokens are recognized; letters are not', () => {
  for (const t of ['1', '4m', 'b7', '5/7', '#4dim', '6m7']) assert.equal(isDegreeToken(t), true, t);
  for (const t of ['C', 'Bbm7', 'F#/A#', 'Sol']) assert.equal(isDegreeToken(t), false, t);
});

test('parseChordInKey resolves degrees against the reference key', () => {
  assert.equal(formatCanonical(parseChordInKey('1', 'Bb')!), 'Bb');
  assert.equal(formatCanonical(parseChordInKey('4', 'Bb')!), 'Eb');
  assert.equal(formatCanonical(parseChordInKey('6m', 'Bb')!), 'Gm');
  assert.equal(formatCanonical(parseChordInKey('b7', 'G')!), 'F');
  const secondary = parseChordInKey('5/7', 'C')!;
  assert.equal(formatCanonical(secondary), 'G/B');
});

test('sharp degree aliases map to the flat spellings pitch classes', () => {
  const sharp4 = nashvilleNotation.parse('#4', { key: 'C' })!;
  const flat5 = nashvilleNotation.parse('b5', { key: 'C' })!;
  assert.equal(sharp4.root, flat5.root);
});

test('letters → degrees conversion injects the reference key and round-trips', () => {
  const letters = '{title: Test}\n[Bb]Isus [Eb]e [Gm]Rege [F]azi';
  const degrees = convertChordPro(letters, { toNotation: 'nashville', key: 'Bb' });
  assert.match(degrees, /\{key: Bb\}/);
  assert.match(degrees, /\[1\]Isus \[4\]e \[6m\]Rege \[5\]azi/);

  const back = convertChordPro(degrees, { toNotation: 'english', key: 'Bb' });
  assert.match(back, /\[Bb\]Isus \[Eb\]e \[Gm\]Rege \[F\]azi/);
});

test('renderChordPro renders degree storage to letters in the reference key', () => {
  const stored = '{title: T}\n{key: G}\n{start_of_verse}\n[1]Doamne [4]sfinte [5/7]vino\n{end_of_verse}';
  const rendered = renderChordPro(stored);
  const chords = rendered.sections[0].lines[0].items.map((i) => i.chord);
  assert.deepEqual(chords, ['G', 'C', 'D/F#']);
  assert.equal(rendered.key, 'G');
});

test('degree storage transposes by key override without touching the chart', () => {
  const stored = '{key: G}\n{start_of_verse}\n[1]La [6m]la [4]la [5]la\n{end_of_verse}';
  const inA = renderChordPro(stored, { transpose: 2 });
  const chords = inA.sections[0].lines[0].items.map((i) => i.chord);
  assert.deepEqual(chords, ['A', 'F#m', 'D', 'E']);
  assert.equal(inA.key, transposeKeyName('G', 2));
});

test('degree storage renders in any notation (solfege, nashville identity)', () => {
  const stored = '{key: C}\n{start_of_verse}\n[1]a [4]b [5]c\n{end_of_verse}';
  const solfege = renderChordPro(stored, { notation: 'solfege' });
  assert.deepEqual(solfege.sections[0].lines[0].items.map((i) => i.chord), ['Do', 'Fa', 'Sol']);
  const nash = renderChordPro(stored, { notation: 'nashville' });
  assert.deepEqual(nash.sections[0].lines[0].items.map((i) => i.chord), ['1', '4', '5']);
});

test('letter chordpro (legacy/local) still parses and renders', () => {
  const letters = '{key: C}\n{start_of_verse}\n[C]a [F]b [G7]c\n{end_of_verse}';
  const rendered = renderChordPro(letters, { notation: 'nashville' });
  assert.deepEqual(rendered.sections[0].lines[0].items.map((i) => i.chord), ['1', '4', '57']);
});
