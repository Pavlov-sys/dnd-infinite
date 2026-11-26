import test from 'node:test';
import assert from 'node:assert/strict';
import { recordChange, undoLast, describeChange, undoDepth } from '../js/ui/undo.js';

const char = () => ({ id: 'u1', updated: 1, hp: { current: 30, temp: 0 }, used: { slots: {}, resources: {}, pact: 0 }, conditions: [], exhaustion: 0, deathSaves: { success: 0, fail: 0 } });

test('changes can be undone step by step, back to the start', () => {
  const c = char();
  assert.equal(recordChange(c, (x) => { x.hp.current = 22; }), true);
  recordChange(c, (x) => { x.used.slots[1] = 1; });
  recordChange(c, (x) => { x.hp.temp = 5; }, 'Gained temp HP');
  assert.equal(undoDepth(), 3);
  assert.equal(undoLast(c), 'Gained temp HP'); assert.equal(c.hp.temp, 0);
  assert.equal(undoLast(c), 'Spell slot used'); assert.deepEqual(c.used.slots, {});
  assert.equal(undoLast(c), 'HP 30 → 22'); assert.equal(c.hp.current, 30);
  assert.equal(undoLast(c), null);
});

test('no-op updates and timestamp-only changes are not recorded', () => {
  const c = char(); c.id = 'u2';
  assert.equal(recordChange(c, () => {}), false);
  assert.equal(recordChange(c, (x) => { x.updated = 99; }), false);
  assert.equal(undoDepth(), 0);
});

test('descriptions name what changed', () => {
  const a = char(), b = structuredClone(a);
  b.hp.current = 0; b.exhaustion = 1; b.conditions = ['prone'];
  assert.equal(describeChange(a, b), 'HP 30 → 0 · Exhaustion 0 → 1 …');
});
