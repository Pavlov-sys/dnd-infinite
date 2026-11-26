import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, untag, flatten, mergeInto, summarize, guessKind } from '../js/engine/importers.js';

const FIVE = {
  _meta: { sources: [{ json: 'TestBrew', full: 'Test Brew Collection', authors: ['Someone'], version: '2.0' }] },
  spell: [{ name: 'Ember Lash', level: 1, school: 'V', time: [{ number: 1, unit: 'action' }], range: { type: 'point', distance: { type: 'feet', amount: 30 } },
    components: { v: true, s: true }, duration: [{ type: 'timed', duration: { type: 'minute', amount: 1 }, concentration: true }],
    entries: ['A whip of fire deals {@damage 2d6} fire damage. The target makes a {@dc 13} Dexterity save.'], savingThrow: ['dexterity'],
    classes: { fromClassList: [{ name: 'Sorcerer' }, { name: 'Wizard' }] } }],
  feat: [{ name: 'Ember Born', prerequisite: [{ level: { level: 4 } }], ability: [{ choose: { from: ['con', 'cha'] } }], entries: ['You gain:', { type: 'list', items: ['Fire resistance.', 'A spark.'] }] }],
  subclass: [{ name: 'Oath of Embers', shortName: 'Embers', className: 'Paladin', subclassFeatures: [] }],
  subclassFeature: [
    { name: 'Oath of Embers', className: 'Paladin', subclassShortName: 'Embers', level: 3, entries: ['Paladins sworn to the flame.'] },
    { name: 'Burning Vow', className: 'Paladin', subclassShortName: 'Embers', level: 3, entries: ['Your weapon blazes. {@atk mw} {@hit 5} to hit.'] },
    { name: 'Cinder Aura', className: 'Paladin', subclassShortName: 'Embers', level: 7, entries: [{ type: 'entries', name: 'Heat', entries: ['Allies resist cold.'] }] },
  ],
  monster: [{ name: 'Ash Hound', size: ['M'], type: 'fiend', alignment: ['C', 'E'], ac: [{ ac: 13 }], hp: { average: 22, formula: '4d8 + 4' }, speed: { walk: 40 },
    str: 14, dex: 15, con: 12, int: 4, wis: 12, cha: 6, passive: 13, cr: '1/2', action: [{ name: 'Bite', entries: ['{@atk mw} {@hit 4} to hit. {@h}7 ({@damage 1d10 + 2}) piercing damage.'] }] }],
};

test('untag and flatten', () => {
  assert.equal(untag('{@damage 2d6} fire, {@dc 13}, {@spell fireball|phb|Fireball}'), '2d6 fire, DC 13, Fireball');
  assert.equal(flatten(['a', { type: 'list', items: ['x', 'y'] }]), 'a\n- x\n- y');
});

test('5etools homebrew converts', () => {
  const { format, pack, warnings } = parseImport(JSON.stringify(FIVE));
  assert.equal(format, '5etools');
  assert.equal(pack.name, 'Test Brew Collection');
  const sp = pack.content.spells[0];
  assert.equal(sp.school, 'Evocation'); assert.equal(sp.range, '30 feet'); assert.ok(sp.concentration);
  assert.deepEqual(sp.classes, ['sorcerer', 'wizard']); assert.equal(sp.damage, '2d6 fire'); assert.equal(sp.save, 'dex');
  const ft = pack.content.feats[0];
  assert.deepEqual(ft.choices[0].options, ['con', 'cha']); assert.match(ft.prereq, /Level 4/);
  const sc = pack.content.subclasses[0];
  assert.equal(sc.classId, 'paladin'); assert.equal(sc.features.length, 2); assert.match(sc.text, /sworn to the flame/);
  assert.match(sc.features[0].text, /Melee Weapon Attack: \+5/);
  const m = pack.content.monsters[0];
  assert.equal(m.cr, 0.5); assert.equal(m.ac, 13); assert.equal(m.alignment, 'chaotic evil'); assert.match(m.actions[0].desc, /7 \(1d10 \+ 2\)/);
  assert.deepEqual(warnings, []);
});

test('native packs, bare entries and merging', () => {
  assert.equal(parseImport({ id: 'x', name: 'X', content: { feats: [{ id: 'f', name: 'F', category: 'general' }] } }).format, 'pack');
  const { pack } = parseImport([{ name: 'Zap', level: 0, school: 'Evocation' }, { name: 'Odd' }], 'Mine');
  assert.equal(pack.content.spells.length, 1);
  assert.equal(guessKind({ classId: 'fighter', features: [] }), 'subclasses');
  const target = { content: { spells: [{ id: 'hb-zap', name: 'Zap' }] } };
  const r = mergeInto(target, pack);
  assert.equal(r.added, 1); assert.equal(r.renamed, 1); assert.equal(target.content.spells.length, 2);
  assert.equal(summarize(pack)[0].count, 1);
  assert.equal(parseImport({ format: 'dnd-infinite-character', name: 'A' }).format, 'character');
});
