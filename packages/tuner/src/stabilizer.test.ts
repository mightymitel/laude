/** PitchStabilizer unit tests (node:test, run via `npm test -w packages/tuner`). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PitchStabilizer } from './stabilizer';

function acceptMany(s: PitchStabilizer, hz: number, times: number, fromMs: number) {
  let last = s.accept(hz, fromMs);
  for (let i = 1; i < times; i++) last = s.accept(hz, fromMs + i * 50);
  return last;
}

test('first accepted reading locks to the nearest note', () => {
  const s = new PitchStabilizer();
  const r = s.accept(440, 0);
  assert.equal(r.hz, 440);
  assert.equal(r.lockedMidi, 69); // A4
  assert.equal(r.cents, 0);
});

test('median-of-5 absorbs a single octave-error frame', () => {
  const s = new PitchStabilizer();
  s.accept(110, 0);
  s.accept(110, 50);
  const r = s.accept(220, 100); // one octave-up glitch
  assert.equal(r.hz, 110, 'median stays on the true pitch');
  assert.equal(r.lockedMidi, 45); // A2
});

test('hysteresis: label holds within 60 cents, relocks beyond', () => {
  const s = new PitchStabilizer();
  acceptMany(s, 440, 5, 0); // lock A4

  // ~ +46.5 cents: still labelled A4, cents reported against it
  const sharp = acceptMany(s, 452, 5, 1000);
  assert.equal(sharp.lockedMidi, 69);
  assert.ok(Math.abs(sharp.cents - 46.5) < 0.5);

  // ~ +69.4 cents: decisively into A#4 territory → relabel
  const relocked = acceptMany(s, 458, 5, 2000);
  assert.equal(relocked.lockedMidi, 70);
  assert.ok(Math.abs(relocked.cents - -30.6) < 0.5);
});

test('reject holds the last value briefly, then decays to idle', () => {
  const s = new PitchStabilizer({ idleAfterMs: 1000 });
  s.accept(440, 0);
  const held = s.reject(600);
  assert.ok(held !== null && held.hz === 440, 'held while fresh');
  assert.ok(s.reject(999) !== null, 'still held just before the deadline');
  assert.equal(s.reject(1000), null, 'idle at the deadline');
});

test('idle decay resets window and lock for the next note', () => {
  const s = new PitchStabilizer({ idleAfterMs: 1000 });
  acceptMany(s, 440, 5, 0);
  assert.equal(s.reject(5000), null);
  const fresh = s.accept(300, 5100); // ~D4
  assert.equal(fresh.hz, 300, 'median window restarted');
  assert.equal(fresh.lockedMidi, 62, 'lock restarted on the new note');
});

test('reset drops all state', () => {
  const s = new PitchStabilizer();
  s.accept(440, 0);
  s.reset();
  assert.equal(s.reject(1), null);
  assert.equal(s.accept(220, 2).lockedMidi, 57);
});
