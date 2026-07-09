/** Degree grammar, modulation anchors and RE-KEY (WP-101). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderChordPro } from './chordpro';
import {
  anchorKeyName,
  rekeyChordPro,
  scanChartKeys,
  segmentChartByKey,
  validateDegreeChart,
} from './degrees';
import { rotateDegreeSymbol } from './notations';

const MODULATING_CHART = `{title: Mod}
{key: C}
[1]Home [4]base
{key: b2}
[1]Up a [5]half
{key: 6m}
[1m]Sad part`;

function flatChords(chart: string, options?: { key?: string }): string[] {
  return renderChordPro(chart, options).sections.flatMap((s) =>
    s.lines.flatMap((l) => l.items.map((i) => i.chord).filter(Boolean)),
  );
}

test('grammar: head letter + degree anchors parse; wrong grammars are errors', () => {
  const ok = scanChartKeys(MODULATING_CHART);
  assert.equal(ok.head, 'C');
  assert.deepEqual(ok.anchors.map((a) => [a.rel, a.minor]), [[1, false], [9, true]]);
  assert.equal(ok.errors.length, 0);

  const degreeAtHead = scanChartKeys('{key: 1}\n[1]x');
  assert.equal(degreeAtHead.head, null);
  assert.equal(degreeAtHead.errors.length, 1);

  const letterAfterHead = scanChartKeys('{key: C}\n[1]x\n{key: Eb}\n[1]y');
  assert.equal(letterAfterHead.head, 'C');
  assert.equal(letterAfterHead.errors.length, 1);
  assert.match(letterAfterHead.errors[0]!.message, /degree/);
});

test('validateDegreeChart requires a head reference key', () => {
  assert.equal(validateDegreeChart(MODULATING_CHART).length, 0);
  const errors = validateDegreeChart('[1]No head here');
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /head \{key:/);
});

test('anchors resolve relative to the head key, anchored not chained', () => {
  const segments = segmentChartByKey(MODULATING_CHART, 'C');
  assert.deepEqual(segments.map((s) => s.key), ['C', 'Db', 'Am']);
  // Anchored: the 6m frame is measured from C ([1]), not from the b2 frame.
  assert.equal(anchorKeyName('C', 9, true), 'Am');
  // The directives themselves are stripped from segment text.
  assert.equal(segments[1]!.text.includes('{key:'), false);
});

test('renderChordPro renders each modulation frame in its own key', () => {
  assert.deepEqual(flatChords(MODULATING_CHART), ['C', 'F', 'Db', 'Ab', 'Am']);
  const keys = renderChordPro(MODULATING_CHART).sections.map((s) => s.key);
  assert.deepEqual(keys, ['C', 'Db', 'Am']);
});

test('transpose moves modulated frames along with the head key (relative anchors)', () => {
  assert.deepEqual(flatChords(MODULATING_CHART, { key: 'D' }), ['D', 'G', 'Eb', 'Bb', 'Bm']);
});

test('re-key: rotate by n then -n is byte-identical', () => {
  const there = rekeyChordPro(MODULATING_CHART, 'D');
  const back = rekeyChordPro(there, 'C');
  assert.equal(back, MODULATING_CHART);
});

test('re-key leaves absolute pitches invariant (head frame, anchors, inner degrees)', () => {
  const rekeyed = rekeyChordPro(MODULATING_CHART, 'D');
  // Head frame degrees rotated…
  assert.match(rekeyed, /\[b7\]Home \[b3\]base/);
  // …anchor values rotated…
  assert.match(rekeyed, /\{key: 7\}/);
  assert.match(rekeyed, /\{key: 5m\}/);
  // …inner degrees of anchored frames untouched.
  assert.match(rekeyed, /\[1\]Up a \[5\]half/);
  assert.match(rekeyed, /\[1m\]Sad part/);
  // Rendered letters are identical before and after: the audio didn't move.
  assert.deepEqual(flatChords(rekeyed), flatChords(MODULATING_CHART));
});

test('re-key keeps a {key: 1} anchor rather than normalizing it away', () => {
  const chart = '{key: C}\n[1]a\n{key: 2}\n[1]b';
  const rekeyed = rekeyChordPro(chart, 'D');
  assert.match(rekeyed, /\{key: 1\}/);
  assert.equal(rekeyChordPro(rekeyed, 'C'), chart);
});

test('re-key refuses charts without a head reference key', () => {
  assert.throws(() => rekeyChordPro('[1]no head', 'D'), /head \{key:/);
});

test('degree rotation covers quality, slash bass and sharp aliases', () => {
  assert.equal(rotateDegreeSymbol('4m', 2), '5m');
  assert.equal(rotateDegreeSymbol('5/7', 2), '6/b2');
  // Sharp aliases normalize to the canonical flat spelling.
  assert.equal(rotateDegreeSymbol('#4', 0), 'b5');
  assert.equal(rotateDegreeSymbol('C', 2), null);
});
