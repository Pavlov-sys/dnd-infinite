// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, profBonus, mod } from '../js/engine/rules.js';
import { roll } from '../js/engine/dice.js';
import { newCharacter } from '../js/engine/store.js';

const fighter = () => {
  const c = newCharacter();
  Object.assign(c, { classId: 'fighter', backgroundId: 'soldier', speciesId: 'dwarf', classSkills: ['athletics', 'perception'] });
  c.abilities.base = { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 };
  c.abilities.bgBonus = { mode: '2-1', plus2: 'str', plus1: 'con' };
  c.inventory = [{ itemId: 'chain-mail', qty: 1, equipped: true }, { itemId: 'shield', qty: 1, equipped: true }, { itemId: 'longsword', qty: 1 }];
  c.classChoices = { 'fighting-style': 'defense', masteries: ['longsword'] };
  return c;
};

test('basic math', () => {
  assert.equal(mod(10), 0); assert.equal(mod(8), -1); assert.equal(mod(17), 3);
  assert.equal(profBonus(1), 2); assert.equal(profBonus(5), 3); assert.equal(profBonus(17), 6);
});

test('level 1 dwarf fighter', () => {
  const d = compute(fighter());
  assert.equal(d.scores.str, 17); assert.equal(d.scores.con, 15);
  assert.equal(d.hpMax, 10 + 2 + 1); // d10 + CON + Dwarven Toughness
  assert.equal(d.ac, 16 + 2 + 1); // chain mail + shield + Defense
  assert.equal(d.skills.athletics.mod, 3 + 2);
  assert.equal(d.saves.str.mod, 5);
  const ls = d.attacks.find((a) => a.name === 'Longsword');
  assert.equal(ls.bonus, 5); assert.equal(ls.damage, '1d8+3'); assert.equal(ls.mastery, 'Sap');
});

test('HP scales with level (average)', () => {
  const c = fighter(); c.level = 5;
  assert.equal(compute(c).hpMax, 13 + 4 * (6 + 2 + 1));
});

test('wizard spellcasting', () => {
  const c = newCharacter();
  Object.assign(c, { classId: 'wizard', backgroundId: 'sage', speciesId: 'elf', level: 3 });
  c.abilities.base = { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 };
  c.abilities.bgBonus = { mode: '2-1', plus2: 'int', plus1: 'con' };
  const sc = compute(c).spellcasting;
  assert.equal(sc.dc, 8 + 2 + 3); assert.deepEqual(sc.slots, [4, 2]); assert.equal(sc.cantripsMax, 3); assert.equal(sc.preparedMax, 6);
});

test('monk unarmored defense and warlock pact', () => {
  const m = newCharacter(); Object.assign(m, { classId: 'monk', speciesId: 'human' });
  m.abilities.base = { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 };
  assert.equal(compute(m).ac, 10 + 3 + 2);
  const w = newCharacter(); Object.assign(w, { classId: 'warlock', level: 5 });
  assert.deepEqual(compute(w).spellcasting.pact, { count: 2, level: 3 });
});

test('dice', () => {
  for (let i = 0; i < 200; i++) { const r = roll('4d6kh3'); assert.ok(r.total >= 3 && r.total <= 18); }
  const r = roll('2d6+3'); assert.ok(r.total >= 5 && r.total <= 15);
});
