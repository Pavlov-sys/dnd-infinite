// Quick adjustments made from the sheet (c.custom) and custom items.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, advantageFor, rollKeys } from '../js/engine/rules.js';
import { newCharacter } from '../js/engine/store.js';
import { SKILLS } from '../js/data/index.js';

const fighter = () => {
  const c = newCharacter();
  Object.assign(c, { classId: 'fighter', backgroundId: 'soldier', speciesId: 'dwarf', classSkills: ['athletics', 'perception'] });
  c.abilities.base = { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 };
  c.abilities.bgBonus = { mode: '2-1', plus2: 'str', plus1: 'con' };
  c.inventory = [{ itemId: 'chain-mail', qty: 1, equipped: true }, { itemId: 'longsword', qty: 1 }];
  c.classChoices = { 'fighting-style': 'defense', masteries: ['longsword'] };
  return c;
};

test('no adjustments leave the numbers alone', () => {
  const d = compute(fighter());
  assert.equal(d.adjusted.size, 0);
  assert.deepEqual(d.advantages, []);
});

test('bonus and override on combat numbers', () => {
  const c = fighter(); const base = compute(c);
  c.custom.bonus = { ac: 1, initiative: 2, speed: 10, hp: 5 };
  let d = compute(c);
  assert.equal(d.ac, base.ac + 1); assert.equal(d.initiative, base.initiative + 2);
  assert.equal(d.speed, base.speed + 10); assert.equal(d.hpMax, base.hpMax + 5);
  assert.ok(d.adjusted.has('ac') && d.adjusted.has('hp'));
  c.custom.override = { ac: 20 };
  d = compute(c);
  assert.equal(d.ac, 20, 'override beats bonus');
  assert.match(d.acNote, /set by hand/);
});

test('skill proficiency changes, and passives follow', () => {
  const c = fighter(); const base = compute(c);
  c.custom.prof = { 'skill:perception': 'expert', 'skill:athletics': 'none', 'skill:stealth': 'half' };
  const d = compute(c);
  assert.equal(d.skills.perception.mod, base.skills.perception.mod + d.pb);
  assert.equal(d.skills.perception.expert, true);
  assert.equal(d.skills.athletics.mod, d.mods.str);
  assert.equal(d.skills.stealth.mod, d.mods.dex + Math.floor(d.pb / 2));
  assert.equal(d.passivePerception, 10 + d.skills.perception.mod);
});

test('save proficiency toggles', () => {
  const c = fighter();
  c.custom.prof = { 'save:wis': 'prof', 'save:str': 'none' };
  const d = compute(c);
  assert.equal(d.saves.wis.prof, true); assert.equal(d.saves.wis.mod, d.mods.wis + d.pb);
  assert.equal(d.saves.str.prof, false); assert.equal(d.saves.str.mod, d.mods.str);
});

test('advantage entries match the right rolls', () => {
  const c = fighter();
  c.custom.adv = [{ id: 'a', kind: 'adv', target: 'check:dex' }, { id: 'b', kind: 'dis', target: 'skill:stealth' }, { id: 'c', kind: 'adv', target: 'save:all' }];
  const stealth = SKILLS.find((s) => s.id === 'stealth');
  const a = advantageFor(c, rollKeys.skill(stealth));
  assert.equal(a.adv.length, 1); assert.equal(a.dis.length, 1);
  assert.equal(advantageFor(c, rollKeys.initiative()).adv.length, 1, 'DEX checks cover initiative');
  assert.equal(advantageFor(c, rollKeys.save('con')).adv.length, 1);
  assert.equal(advantageFor(c, rollKeys.weapon()).adv.length, 0);
});

test('custom weapons and armor work like catalogue items', () => {
  const c = fighter();
  c.inventory = [
    { itemId: null, qty: 1, equipped: true, custom: { name: 'Bone Plate', type: 'armor', armorType: 'heavy', ac: 17, weight: 50 } },
    { itemId: null, qty: 1, equipped: false, custom: { name: 'Sky Glaive', type: 'weapon', category: 'martial', kind: 'melee', damage: '1d10', dtype: 'slashing', props: ['Reach', 'Heavy', 'Two-Handed'] } },
    { itemId: null, qty: 2, equipped: false, custom: { name: 'Fine Clothes', type: 'gear', clothing: true, weight: 6 } },
  ];
  const d = compute(c);
  assert.equal(d.ac, 18, 'custom heavy armor 17 + Defense');
  const glaive = d.attacks.find((a) => a.name === 'Sky Glaive');
  assert.ok(glaive, 'custom weapon shows as an attack');
  assert.equal(glaive.bonus, d.mods.str + d.pb);
  assert.equal(d.inventory.length, 3);
});

test('spells added from another source can be free once per Long Rest', () => {
  const c = fighter();
  c.extras.spells = [{ spellId: 'magic-missile', source: 'Ring', freePerLongRest: 1 }];
  const d = compute(c);
  const g = d.grantedSpells.find((x) => x.spellId === 'magic-missile');
  assert.equal(g.freePerLongRest, 1); assert.equal(g.castable, true);
});

test('rules check: exhaustion, Aura of Protection, homebrew initiative feats, shield bonus, unarmed strike', () => {
  const c = fighter(); c.exhaustion = 2;
  let d = compute(c);
  assert.equal(d.d20Penalty, 4);
  assert.equal(d.speed, 20, 'dwarf 30 ft minus 10 for two levels of exhaustion');
  const p = fighter(); Object.assign(p, { classId: 'paladin', level: 6 }); p.abilities.base.cha = 14;
  d = compute(p);
  assert.equal(d.saves.wis.mod, d.mods.wis + d.pb + 2, 'Paladin adds CHA to saves from level 6');
  p.level = 5; d = compute(p);
  assert.equal(d.saves.wis.mod, d.mods.wis + d.pb);
  const s = fighter(); s.inventory.push({ itemId: null, qty: 1, equipped: true, custom: { name: 'Tower Shield', type: 'armor', armorType: 'shield', ac: 3 } });
  assert.equal(compute(s).ac, compute(fighter()).ac + 3);
  const weak = fighter(); weak.abilities.base.str = 8; weak.abilities.bgBonus = { mode: '2-1', plus2: 'con', plus1: 'dex' };
  assert.equal(compute(weak).attacks.find((a) => a.unarmed).damage, '0', 'Unarmed Strike is 1 + STR modifier');
});
