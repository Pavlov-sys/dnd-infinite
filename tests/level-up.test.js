import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter } from '../js/engine/store.js';
import { compute } from '../js/engine/rules.js';
import { previewLevelUp, applyLevel, levelChanges, rollBack } from '../js/ui/level-up.js';

const wiz = (level) => { const c = newCharacter(); Object.assign(c, { classId: 'wizard', level }); c.abilities.base.con = 14; return c; };

test('average HP and a rolled HP die both add CON', () => {
  const c = wiz(1); const base = compute(c).hpMax;
  assert.equal(compute(previewLevelUp(c)).hpMax, base + 4 + 2);
  assert.equal(compute(previewLevelUp(c, 6)).hpMax, base + 6 + 2);
  assert.equal(c.level, 1, 'preview leaves the character alone');
});

test('rolling keeps earlier levels at the average', () => {
  const c = wiz(3); const base = compute(c).hpMax;
  const n = previewLevelUp(c, 1);
  assert.equal(compute(n).hpMax, base + 1 + 2);
  assert.equal(n.settings.hpType, 'manual');
});

test('the summary lists new features, slots and proficiency bonus', () => {
  const c = wiz(4); const d0 = compute(c), d1 = compute(previewLevelUp(c));
  const { changes } = levelChanges(d0, d1);
  const k = Object.fromEntries(changes);
  assert.equal(k['Proficiency Bonus'], '+2 → +3');
  assert.match(k['Spell slots'], /3rd: 0 → 2/);
  assert.equal(k['Highest spell level'], '2nd → 3rd');
});

test('fighters see Extra Attack at level 5', () => {
  const c = newCharacter(); Object.assign(c, { classId: 'fighter', level: 4 });
  const { features, changes } = levelChanges(compute(c), compute(previewLevelUp(c)));
  assert.ok(features.some((f) => f.name === 'Extra Attack'));
  assert.ok(changes.some(([k]) => k === 'Attacks per Attack action'));
});

test('a level-up can be rolled back exactly', () => {
  const c = wiz(2); c.hp.current = 9; c.notes = 'before';
  const snapshot = structuredClone(c);
  c.levelHistory = [{ from: 2, to: 3, at: 1, snapshot }];
  applyLevel(c, null); c.hp.current = 3;
  assert.equal(rollBack(c), true);
  assert.equal(c.level, 2); assert.equal(c.hp.current, 9); assert.deepEqual(c.levelHistory, []);
  assert.equal(rollBack(c), false);
});
