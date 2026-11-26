// Data integrity: every reference in the hand-modelled data must resolve against the generated SRD data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { all, getItem, getSpell, getFeat, validatePack } from '../js/data/index.js';

test('SRD content is loaded', () => {
  assert.ok(all('spells').length >= 330);
  assert.ok(all('monsters').length >= 330);
  assert.ok(all('items').filter((i) => i.type === 'magic-item').length >= 250);
});

test('all starting equipment items exist', () => {
  for (const src of [...all('classes'), ...all('backgrounds')]) {
    for (const opt of src.equipment) for (const [id] of opt.items) assert.ok(getItem(id), `${src.name}: missing item ${id}`);
  }
});

test('granted spells and feats exist', () => {
  for (const id of ['dancing-lights', 'prestidigitation', 'druidcraft', 'minor-illusion', 'mending', 'poison-spray', 'chill-touch', 'fire-bolt', 'thaumaturgy', 'hunters-mark', 'divine-smite', 'speak-with-animals']) assert.ok(getSpell(id), id);
  for (const b of all('backgrounds')) if (!b.feat.choose) assert.ok(getFeat(b.feat.id), b.feat.id);
});

test('every class spell list has spells of every level it can cast', () => {
  for (const c of all('classes').filter((x) => x.caster)) {
    const max = c.caster.type === 'half' ? 5 : 9;
    for (let lv = 1; lv <= max; lv++) assert.ok(all('spells').some((s) => s.level === lv && s.classes.includes(c.caster.list)), `${c.name} level ${lv}`);
  }
});

test('SRD rules text is attached to features', () => {
  const missing = [];
  for (const c of all('classes')) for (const f of c.features) if (!f.text) missing.push(`${c.name}: ${f.name}`);
  assert.ok(missing.length < 8, `Features without full text: ${missing.join('; ')}`);
});

test('pack validation', () => {
  assert.deepEqual(validatePack({ id: 'x', name: 'X', content: { monsters: [{ id: 'm', name: 'M' }] } }), []);
  assert.ok(validatePack({ id: 'x', name: 'X', content: { wizards: [] } }).length);
});

test('optional packs load and attach', () => {
  const classes = all('classes').map((c) => c.id);
  for (const id of ['mechanist', 'witch', 'vanguard', 'theurge']) assert.ok(classes.includes(id), id);
  const druid = all('classes').find((c) => c.id === 'druid');
  assert.ok(druid.subclasses.some((s) => s.name === 'Circle of Bees'));
  assert.ok(all('spells').length > 1000);
  assert.ok(all('species').length > 30);
});

test('new classes compute', async () => {
  const { compute } = await import('../js/engine/rules.js');
  const { newCharacter } = await import('../js/engine/store.js');
  const c = newCharacter(); Object.assign(c, { classId: 'witch', level: 5 });
  const d = compute(c);
  assert.deepEqual(d.spellcasting.slots, [4, 3, 2]);
  assert.ok(d.spellcasting.cantripsMax >= 3);
  const v = newCharacter(); Object.assign(v, { classId: 'vanguard', level: 19 });
  const { featSlots } = await import('../js/engine/rules.js');
  assert.ok(featSlots(compute(v).cls, 19).every((s) => s.kind === 'general'));
});
