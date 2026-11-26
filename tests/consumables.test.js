import test from 'node:test';
import assert from 'node:assert/strict';
import { ammoForWeapon, ammoKindOfItem, spendAmmo, recoverAmmo, ammoCount, consumableOf, useOne, critDice } from '../js/engine/consumables.js';
import { newCharacter } from '../js/engine/store.js';
import { compute } from '../js/engine/rules.js';

test('weapons know their ammunition', () => {
  assert.equal(ammoForWeapon({ id: 'longbow', props: ['Ammunition', 'Heavy'] }), 'arrows');
  assert.equal(ammoForWeapon({ id: 'light-crossbow', props: ['Ammunition'] }), 'bolts');
  assert.equal(ammoForWeapon({ id: 'sling', props: ['Ammunition'] }), 'bullets-sling');
  assert.equal(ammoForWeapon({ id: 'dagger', props: ['Finesse', 'Thrown'] }), null);
  assert.equal(ammoKindOfItem({ name: 'Arrows (20)', type: 'gear' }), 'arrows');
  assert.equal(ammoKindOfItem({ id: 'longbow', name: 'Longbow', type: 'weapon' }), null);
});

test('firing spends arrows and recovering brings back half', () => {
  const c = newCharacter(); Object.assign(c, { classId: 'fighter', level: 3 });
  c.inventory = [{ itemId: 'longbow', qty: 1, equipped: true }, { itemId: 'arrows', qty: 5 }];
  let d = compute(c);
  const bow = d.attacks.find((a) => a.name === 'Longbow');
  assert.equal(bow.ammo, 'arrows');
  for (let i = 0; i < 5; i++) spendAmmo(c, compute(c).inventory, 'arrows');
  d = compute(c);
  assert.equal(ammoCount(d.inventory, 'arrows'), 0);
  assert.equal(c.inventory.length, 2, 'the empty quiver stays so arrows can be recovered into it');
  assert.equal(spendAmmo(c, d.inventory, 'arrows'), -1, 'no arrows left');
  assert.equal(recoverAmmo(c, d.inventory, 'arrows'), 2);
  assert.equal(ammoCount(compute(c).inventory, 'arrows'), 2);
  assert.deepEqual(c.used.ammo, {});
});

test('consumables', () => {
  assert.deepEqual(consumableOf({ id: 'potion-of-healing', name: 'Potion of Healing', type: 'gear' }).dice, '2d4+2');
  assert.equal(consumableOf({ name: 'Potion of Greater Healing', type: 'magic-item' }).dice, '4d4+4');
  assert.equal(consumableOf({ name: 'Potion of Supreme Healing' }).dice, '10d4+20');
  assert.equal(consumableOf({ name: 'Potion of Poison', type: 'magic-item', category: 'Potions' }).kind, 'use');
  assert.equal(consumableOf({ id: 'alchemists-fire', name: "Alchemist's Fire" }).kind, 'damage');
  assert.equal(consumableOf({ id: 'longsword', name: 'Longsword', type: 'weapon' }), null);
  const c = { inventory: [{ itemId: 'potion-of-healing', qty: 2 }] };
  assert.equal(useOne(c, 0), 1); assert.equal(useOne(c, 0), 0); assert.equal(c.inventory.length, 0);
  assert.equal(critDice('2d6+3'), '4d6+3');
});
