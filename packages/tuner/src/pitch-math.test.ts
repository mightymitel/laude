/** Pitch math unit tests (node:test, run via `npm test -w packages/tuner`). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  centsBetween,
  clampCents,
  hzToMidi,
  median,
  midiToHz,
  noteIndexOf,
  octaveOf,
} from './pitch-math';
import { centsToGuitarString, GUITAR_STRINGS, nearestGuitarString } from './guitar';

test('hzToMidi maps reference pitches (A4=440)', () => {
  assert.equal(hzToMidi(440), 69);
  assert.equal(hzToMidi(220), 57);
  assert.equal(hzToMidi(880), 81);
  // E2 ≈ 82.407 Hz → MIDI 40
  assert.ok(Math.abs(hzToMidi(82.407) - 40) < 0.001);
});

test('hzToMidi honours a custom A4 reference', () => {
  assert.equal(hzToMidi(442, 442), 69);
  assert.ok(hzToMidi(440, 442) < 69);
});

test('midiToHz inverts hzToMidi', () => {
  for (const hz of [82.41, 110, 196, 329.63, 440]) {
    assert.ok(Math.abs(midiToHz(hzToMidi(hz)) - hz) < 1e-9);
  }
});

test('noteIndexOf and octaveOf name the note', () => {
  assert.equal(noteIndexOf(69), 9); // A4 → A
  assert.equal(octaveOf(69), 4);
  assert.equal(noteIndexOf(60), 0); // C4 → C
  assert.equal(octaveOf(60), 4);
  assert.equal(noteIndexOf(40), 4); // E2 → E
  assert.equal(octaveOf(40), 2);
  assert.equal(noteIndexOf(11), 11); // B-1
  assert.equal(octaveOf(11), -1);
});

test('centsBetween is signed and semitone = 100 cents', () => {
  assert.equal(centsBetween(69.25, 69), 25);
  assert.ok(Math.abs(centsBetween(68.9, 69) - -10) < 1e-9);
  assert.equal(centsBetween(70, 69), 100);
});

test('clampCents caps to ±50', () => {
  assert.equal(clampCents(75), 50);
  assert.equal(clampCents(-75), -50);
  assert.equal(clampCents(12), 12);
});

test('median picks middle value and kills a single octave outlier', () => {
  assert.equal(median([110]), 110);
  assert.equal(median([110, 112, 111]), 111);
  // one octave-error frame among five does not move the median
  assert.equal(median([110, 111, 220, 110, 111]), 111);
  assert.throws(() => median([]));
});

test('nearestGuitarString snaps to standard tuning', () => {
  assert.equal(GUITAR_STRINGS.length, 6);
  assert.equal(nearestGuitarString(40.3).number, 6); // near E2
  assert.equal(nearestGuitarString(46).number, 5); // A2 side of the A2/D3 midpoint
  assert.equal(nearestGuitarString(52).number, 4); // near D3
  assert.equal(nearestGuitarString(57.4).number, 2); // B3 side of the G3/B3 midpoint
  assert.equal(nearestGuitarString(62).number, 1); // E4 side of the B3/E4 midpoint
});

test('centsToGuitarString measures against the string target, clamped', () => {
  const e2 = nearestGuitarString(40);
  assert.equal(centsToGuitarString(40.25, e2), 25);
  assert.equal(centsToGuitarString(39.2, e2), -50); // -80 cents clamps
});
