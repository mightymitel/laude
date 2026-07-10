/** partsToChordPro (DEC-46): parts with inline degree tokens → storable chart
 * that round-trips through renderChordPro. tsx --test. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderChordPro } from './chordpro';
import { partsToChordPro } from './partsToChordPro';

const PARTS = [
  { type: 'verse', lines: [{ text: '[1]Ce mare ești [4]Tu' }, { text: '[5]Doamne [1]sfânt' }] },
  { type: 'chorus', lines: [{ text: '[6m]Aleluia [4]a[5]men' }] },
  { type: 'verse', lines: [{ text: 'A doua strofă [1]vine' }] },
];

test('builds a degree chart with head {key:} that renderChordPro parses back', () => {
  const chart = partsToChordPro(PARTS, 'G', 'Cântare');
  assert.match(chart, /\{key: G\}/);
  const rendered = renderChordPro(chart, { notation: 'nashville' });
  assert.equal(rendered.title, 'Cântare');
  assert.equal(rendered.sections.length, 3);
  assert.deepEqual(
    rendered.sections.map((s) => s.type),
    ['verse', 'chorus', 'verse'],
  );
  // Content round-trips: same lyric text, same tokens in place.
  const line1 = rendered.sections[0]!.lines[0]!.items
    .map((i) => (i.chord ? `[${i.chord}]${i.lyrics}` : i.lyrics))
    .join('');
  assert.equal(line1, '[1]Ce mare ești [4]Tu');
});

test('verse ordinals count up; chorus/bridge labels stay unnumbered', () => {
  const chart = partsToChordPro(PARTS, 'D');
  assert.match(chart, /\{start_of_verse: Verse 1\}/);
  assert.match(chart, /\{start_of_chorus: Chorus\}/);
  assert.match(chart, /\{start_of_verse: Verse 2\}/);
});

test('non-core part types render as typed verse sections (lossless content)', () => {
  const chart = partsToChordPro([{ type: 'pre-chorus', lines: [{ text: '[2m]hei' }] }], 'C');
  assert.match(chart, /\{start_of_verse: Pre-chorus 1\}/);
  const rendered = renderChordPro(chart, { notation: 'nashville' });
  assert.equal(rendered.sections[0]!.label, 'Pre-chorus 1');
});

test('a messy title (newlines, braces) degrades instead of corrupting the chart', () => {
  const chart = partsToChordPro(
    [{ type: 'verse', lines: [{ text: '[1]la' }] }],
    'C',
    'Har bogat\n\n  C\n  C#\n{junk}',
  );
  const rendered = renderChordPro(chart, { notation: 'nashville' });
  assert.equal(rendered.title, 'Har bogat C C# junk');
  assert.equal(rendered.sections.length, 1);
});

test('letters render from the built degree chart in the reference key', () => {
  const chart = partsToChordPro([{ type: 'verse', lines: [{ text: '[1]la [4]la [5]la' }] }], 'G');
  const english = renderChordPro(chart, { notation: 'english' });
  const chords = english.sections[0]!.lines[0]!.items.map((i) => i.chord).filter(Boolean);
  assert.deepEqual(chords, ['G', 'C', 'D']);
});
