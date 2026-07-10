/** Chord approximation across parts (DEC-107) — the import path's verse-1
 * extrapolation. tsx --test. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  approximateChordsFromPart,
  copyChordsFromPart,
  embedChordTokens,
  extractChordTokens,
} from './approximation';

test('extractChordTokens splits text and positioned tokens; embed inverts it', () => {
  const line = '[1]Amazing [4]grace how [5/7]sweet';
  const { text, tokens } = extractChordTokens(line);
  assert.equal(text, 'Amazing grace how sweet');
  assert.deepEqual(tokens, [
    { token: '1', index: 0 },
    { token: '4', index: 8 },
    { token: '5/7', index: 18 },
  ]);
  assert.equal(embedChordTokens(text, tokens), line);
});

test('bracket content with whitespace or nothing is literal text, not a chord', () => {
  const { text, tokens } = extractChordTokens('sing [together now] la [] [1]la');
  assert.equal(tokens.length, 1);
  assert.deepEqual(tokens[0], { token: '1', index: text.length - 2 });
  assert.equal(text, 'sing [together now] la [] la');
});

test('approximate maps chords proportionally onto a differently-sized line', () => {
  const source = { lines: [{ text: '[1]La la la [4]la' }] };
  const target = { lines: [{ text: 'Ce mare ești Tu Doamne sfânt' }] };
  const src = extractChordTokens(source.lines[0]!.text); // 'La la la la', chords at 0 and 9
  const out = approximateChordsFromPart(source, target);
  const { tokens, text } = extractChordTokens(out.lines[0]!.text);
  assert.equal(text, 'Ce mare ești Tu Doamne sfânt');
  assert.deepEqual(
    tokens,
    src.tokens.map(({ token, index }) => ({
      token,
      index: Math.round((index / src.text.length) * text.length),
    })),
    'positions scale by character ratio',
  );
});

test('approximate replaces existing target chords and loops source lines cyclically', () => {
  const source = {
    lines: [{ text: '[1]primul [5]rând' }, { text: '[6m]al [4]doilea' }],
  };
  const target = {
    lines: [
      { text: '[2]stale [3]chords here' },
      { text: 'linia a doua' },
      { text: 'a treia revine la primul' },
    ],
  };
  const out = approximateChordsFromPart(source, target);
  assert.deepEqual(
    out.lines.map((l) => extractChordTokens(l.text).tokens.map((t) => t.token)),
    [['1', '5'], ['6m', '4'], ['1', '5']],
    'stale chords replaced; 3rd target line wraps to source line 1',
  );
  assert.equal(extractChordTokens(out.lines[0]!.text).text, 'stale chords here');
});

test('approximate from an empty source returns the target untouched', () => {
  const target = { lines: [{ text: '[1]keep me' }] };
  assert.deepEqual(approximateChordsFromPart({ lines: [] }, target), target);
});

test('approximate preserves extra part/line fields (generic pass-through)', () => {
  const source = { id: 'V1', lines: [{ text: '[1]la' }] };
  const target = { id: 'V2', lines: [{ text: 'lo', ref: 7 }] };
  const out = approximateChordsFromPart(source, target);
  assert.equal(out.id, 'V2');
  assert.equal((out.lines[0] as { ref?: number }).ref, 7);
});

test('copyChordsFromPart copies at the same positions, only for shared line indexes', () => {
  const source = { lines: [{ text: '[1]Ala [4]bala' }, { text: '[5]doar sursa' }] };
  const target = { lines: [{ text: 'Omul bun aici' }] };
  const out = copyChordsFromPart(source, target);
  assert.equal(out.lines.length, 1);
  const { tokens } = extractChordTokens(out.lines[0]!.text);
  assert.deepEqual(tokens, [
    { token: '1', index: 0 },
    { token: '4', index: 4 },
  ]);
});

test('degree and letter tokens are both opaque — same behaviour', () => {
  const degrees = approximateChordsFromPart(
    { lines: [{ text: '[b7]mo [4m]dal' }] },
    { lines: [{ text: 'ținta mea' }] },
  );
  const letters = approximateChordsFromPart(
    { lines: [{ text: '[Bb]mo [Fm]dal' }] },
    { lines: [{ text: 'ținta mea' }] },
  );
  assert.deepEqual(
    extractChordTokens(degrees.lines[0]!.text).tokens.map((t) => t.index),
    extractChordTokens(letters.lines[0]!.text).tokens.map((t) => t.index),
  );
});
