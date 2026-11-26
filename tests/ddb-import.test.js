// D&D Beyond PDF import: the PDF field reader and the sheet → character conversion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readPdfFields, decodePdfString } from '../js/engine/pdf-fields.js';
import { fromDdbFields, importDdbPdf, featureEntries, parseClasses, findByName, discardPlaceholders } from '../js/engine/ddb-import.js';
import { compute } from '../js/engine/rules.js';

const latin1 = (s) => Buffer.from(s, 'latin1');
const utf16 = (s) => `<FEFF${[...s].map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('')}>`;
const lit = (s) => `(${s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\n/g, '\\n')})`;

/** Build a minimal PDF whose page has one text widget per field. compressed: put widgets in an object stream. */
function makePdf(fields, { compressed = false } = {}) {
  const widgets = Object.entries(fields).map(([k, v], i) => ({ num: 10 + i, body: `<</Type/Annot/Subtype/Widget/FT/Tx/T${lit(k)}/V${/[^\x00-\x7f]/.test(v) ? utf16(v) : lit(v)}/Rect[0 0 10 10]>>` }));
  const annots = `[${widgets.map((w) => `${w.num} 0 R`).join(' ')}]`;
  const plain = [
    { num: 1, body: '<</Type/Catalog/Pages 2 0 R>>' },
    { num: 2, body: '<</Type/Pages/Kids[3 0 R]/Count 1>>' },
    { num: 3, body: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Annots ${annots}>>` },
  ];
  let out = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  const emit = (num, body) => { offsets[num] = out.length; out += `${num} 0 obj\n${body}\nendobj\n`; };
  for (const o of plain) emit(o.num, o.body);
  if (compressed) {
    let head = ''; let data = '';
    for (const w of widgets) { head += `${w.num} ${data.length} `; data += `${w.body}\n`; }
    const raw = latin1(head + data);
    const z = deflateSync(raw).toString('latin1');
    emit(5, `<</Type/ObjStm/N ${widgets.length}/First ${head.length}/Filter/FlateDecode/Length ${z.length}>>\nstream\n${z}\nendstream`);
  } else for (const w of widgets) emit(w.num, w.body);
  out += `trailer\n<</Root 1 0 R>>\n%%EOF\n`;
  return new Uint8Array(latin1(out));
}

test('PDF strings decode (PDFDoc, UTF-16, escapes)', async () => {
  assert.equal(decodePdfString([0x80, 0x41]), '•A');
  assert.equal(decodePdfString([0xfe, 0xff, 0x20, 0x19]), '’');
  const { fields } = await readPdfFields(makePdf({ A: 'one (two) \\ three\nfour', B: 'spell’s', C: '' }));
  assert.equal(fields.A, 'one (two) \\ three\nfour');
  assert.equal(fields.B, 'spell’s');
  assert.equal(fields.C, '');
});

test('PDF fields are read from compressed object streams too', async () => {
  const { fields } = await readPdfFields(makePdf({ CharacterName: 'Testa', 'CLASS  LEVEL': 'Fighter 1' }, { compressed: true }));
  assert.equal(fields.CharacterName, 'Testa');
  assert.equal(fields['CLASS  LEVEL'], 'Fighter 1');
});

test('non-PDF and non-D&D Beyond files are refused with a clear message', async () => {
  await assert.rejects(() => readPdfFields(new TextEncoder().encode('hello')), /not a PDF/);
  await assert.rejects(() => importDdbPdf(makePdf({ Foo: 'bar' })), /doesn’t look like a D&D Beyond/);
});

test('sheet text helpers', () => {
  assert.deepEqual(parseClasses('Fighter 5 / Wizard (Evoker) 2'), [{ name: 'Fighter', sub: null, level: 5 }, { name: 'Wizard', sub: 'Evoker', level: 2 }]);
  const e = featureEntries('=== CLERIC FEATURES ===\n\n* Divine Order • PHB-2024 69\nText here.\n   | Thaumaturge\n\n=== FEATS ===\n\n* Alert • PHB-2024 200\nInitiative.');
  assert.equal(e.length, 2);
  assert.deepEqual(e[0].picks, ['Thaumaturge']);
  assert.equal(e[1].section, 'FEATS');
  assert.equal(findByName('spells', "Melf's Acid Arrow")?.id, 'acid-arrow');
  assert.equal(findByName('items', 'Clothes, Fine')?.id, 'clothes-fine');
});

// A made-up level 5 cleric, filled in the way D&D Beyond fills its sheet.
const CLERIC = {
  CharacterName: 'Brother Tamsin', 'CLASS  LEVEL': 'Cleric 5', 'PLAYER NAME': 'Test', RACE: 'Dwarf', BACKGROUND: 'Acolyte', 'EXPERIENCE POINTS': '6500',
  STR: '14', DEX: '10', CON: '15', INT: '10', WIS: '17', CHA: '12',
  'ST Strength': '+2', 'ST Dexterity': '+0', 'ST Constitution': '+2', 'ST Intelligence': '+0', 'ST Wisdom': '+6', 'ST Charisma': '+4',
  InsightProf: 'P', Insight: '+6', ReligionProf: 'P', Religion: '+3', MedicineProf: 'P', Medicine: '+6', PersuasionProf: 'P', Persuasion: '+4',
  Perception: '+3', Passive1: '13', Init: '+0', ProfBonus: '+3', Speed: '30 ft. (Walking)', AC: '18', MaxHP: '48', CurrentHP: '40', TempHP: '--',
  ProficienciesLang: "=== ARMOR === \nLight Armor, Medium Armor, Shields \n\n=== WEAPONS === \nSimple Weapons \n\n=== TOOLS === \nCalligrapher's Supplies, Smith's Tools \n\n=== LANGUAGES === \nCommon, Dwarvish, Elvish",
  FeaturesTraits1: "=== CLERIC FEATURES === \n\n* Spellcasting • PHB-2024 69 \n\n* Divine Order • PHB-2024 69 \n   | Protector \n\n* Cleric Subclass • PHB-2024 71 \n   | Life Domain \n\n=== FEATS === \n\n* Magic Initiate (Cleric) • PHB-2024 201 \n   | Wisdom • \n\n* Ability Score Improvement • PHB-2024 202",
  'Wpn Name': 'Mace', 'Wpn1 AtkBonus': '+5',
  'Eq Name0': 'Mace', 'Eq Qty0': '1', 'Eq Name1': 'Chain Mail', 'Eq Qty1': '1', 'Eq Name2': 'Shield', 'Eq Qty2': '1', 'Eq Name3': 'Lucky Pebble', 'Eq Qty3': '2', 'Eq Weight3': '1 lb.',
  GP: '42', SP: '3',
  spellCastingClass0: 'Cleric', spellSaveDC0: '14', spellAtkBonus0: '+6',
  spellName0: 'Guidance', spellSource0: 'Magic Initiate (Cleric)', spellName1: 'Sacred Flame', spellSource1: 'Magic Initiate (Cleric)',
  spellName2: 'Light', spellSource2: 'Cleric', spellName3: 'Thaumaturgy', spellSource3: 'Cleric', spellName4: 'Spare the Dying', spellSource4: 'Cleric',
  spellName5: 'Bless', spellSource5: 'Magic Initiate (Cleric)', spellName6: 'Cure Wounds', spellSource6: 'Cleric', spellName7: 'Healing Word', spellSource7: 'Cleric',
  spellName8: 'Made-Up Spell', spellSource8: 'Cleric', spellPage8: 'XYZ 1',
  spellName9: 'Spiritual Weapon', spellSource9: 'Cleric',
  PersonalityTraits: 'Calm.', Ideals: 'Charity.',
};

test('a D&D Beyond sheet becomes a matching Infinity Codex character', () => {
  const { character: c, report } = fromDdbFields(CLERIC);
  const d = compute(c);
  assert.equal(c.name, 'Brother Tamsin');
  assert.equal(c.classId, 'cleric'); assert.equal(c.level, 5);
  assert.equal(c.subclassId, 'life');
  assert.equal(c.speciesId, 'dwarf'); assert.equal(c.backgroundId, 'acolyte');
  assert.equal(c.classChoices['divine-order'], 'protector');
  assert.equal(c.settings.advancement, 'xp'); assert.equal(c.xp, 6500);
  assert.deepEqual(c.featChoices.background.cantrips, ['guidance', 'sacred-flame']);
  assert.deepEqual(c.featChoices.background.spell, ['bless']);
  assert.equal(c.featChoices.background.ability, 'wis');
  assert.equal(c.levelFeats['level-4'], 'ability-score-improvement');
  assert.ok(c.spells.cantrips.includes('light') && c.spells.prepared.includes('cure-wounds'));
  assert.deepEqual(c.languages, ['Dwarvish', 'Elvish']);
  assert.ok(c.extras.tools.includes("Smith's Tools"));
  assert.ok(report.created.some((m) => m.name === 'Made-Up Spell'));
  assert.ok(c.spells.prepared.includes('ddb-made-up-spell'));
  const pebble = c.inventory.find((e) => e.custom?.name === 'Lucky Pebble');
  assert.equal(pebble.qty, 2); assert.equal(pebble.custom.weight, 0.5);
  assert.ok(c.inventory.find((e) => e.itemId === 'chain-mail').equipped);
  assert.equal(c.currency.gp, 42);
  assert.equal(c.hp.current, 40);
  assert.equal(d.hpMax, 48); assert.equal(d.ac, 18);
  assert.equal(d.skills.medicine.mod, 6); assert.equal(d.spellcasting.dc, 14);
  assert.deepEqual(report.diffs, [], JSON.stringify(report.diffs));
  assert.equal(c.details.personality, 'Calm.');
  discardPlaceholders();
});

test('the full PDF path works end to end', async () => {
  const { character } = await importDdbPdf(makePdf(CLERIC, { compressed: true }));
  assert.equal(character.subclassId, 'life');
  discardPlaceholders();
});

// A made-up homebrew class, subclass, species and feat that no pack has.
const STRANGER = {
  CharacterName: 'Vey', 'CLASS  LEVEL': 'Hexknight 5', RACE: 'Moonkin', BACKGROUND: 'Soldier', 'EXPERIENCE POINTS': '(Milestone)',
  STR: '16', DEX: '12', CON: '14', INT: '10', WIS: '10', CHA: '16', StrProf: '•', ChaProf: '•', SIZE: 'Small', Speed: '35 ft. (Walking)', AdditionalSenses: 'Darkvision 60 ft.',
  AthleticsProf: 'P', IntimidationProf: 'P', ArcanaProf: 'P', StealthProf: 'P', Total: '5d10', MaxHP: '52', AC: '16',
  ProficienciesLang: '=== ARMOR === \nLight Armor, Medium Armor, Shields \n\n=== WEAPONS === \nSimple Weapons, Martial Weapons \n\n=== LANGUAGES === \nCommon',
  FeaturesTraits1: '=== HEXKNIGHT FEATURES === \n\n* Hex Strike • HK 10 \nYour weapon attacks deal an extra 1d6 necrotic damage. \n\n* Dark Ward • HK 11 \nYou gain temporary hit points. \n   | 2 / Long Rest \n\n* Hexknight Subclass • HK 12 \n   | Order of Ash \n\n* Ash Cloak • HK 20 \nYou can turn invisible in smoke. \n   | 1 / Short Rest \n\n* Extra Attack • HK 12 \nYou attack twice. \n\n=== MOONKIN SPECIES TRAITS === \n\n* Lunar Step • MK 2 \nYou can teleport 10 feet. \n\n=== FEATS === \n\n* Moonblessed • MK 5 \nYou shine softly.',
  spellCastingClass0: 'Hexknight', spellCastingAbility0: 'CHA', spellHeader0: '=== 1st LEVEL ===', spellSlotHeader0: '4 Slots OOOO', spellHeader1: '=== 2nd LEVEL ===', spellSlotHeader1: '2 Slots OO',
  spellName0: 'Shield', spellSource0: 'Hexknight', spellName1: 'Witchfire Lance', spellSource1: 'Hexknight', spellSaveHit1: 'DEX 13', spellCastingTime1: '1BA', spellPage1: 'HK 30',
  spellName2: 'Misty Step', spellSource2: 'Hexknight',
};

test('unknown class, subclass, species and feats become editable placeholders', () => {
  const { character: c, report, placeholders } = fromDdbFields(STRANGER);
  try {
    const d = compute(c);
    assert.deepEqual(report.missing, []);
    assert.deepEqual(report.created.map((x) => x.kind).sort(), ['Class', 'Feat', 'Species', 'Spell', 'Subclass']);
    const cls = placeholders.classes[0];
    assert.equal(cls.id, 'ddb-hexknight'); assert.equal(cls.hitDie, 10);
    assert.deepEqual(cls.saves, ['str', 'cha']);
    assert.deepEqual(cls.armor, ['light', 'medium', 'shield']);
    assert.equal(cls.caster.ability, 'cha'); assert.equal(cls.caster.type, 'half');
    assert.deepEqual(cls.features.map((f) => f.name), ['Hex Strike', 'Dark Ward', 'Extra Attack']);
    assert.deepEqual(cls.resources, [{ id: 'dark-ward', name: 'Dark Ward', reset: 'long', uses: 2 }]);
    const sub = placeholders.subclasses[0];
    assert.equal(sub.classId, 'ddb-hexknight'); assert.deepEqual(sub.features.map((f) => f.name), ['Ash Cloak']);
    assert.equal(placeholders.species[0].size, 'Small'); assert.equal(placeholders.species[0].speed, 35); assert.equal(placeholders.species[0].darkvision, 60);
    const lance = placeholders.spells[0];
    assert.equal(lance.level, 1); assert.equal(lance.save, 'dex'); assert.equal(lance.time, '1 bonus action'); assert.deepEqual(lance.classes, ['ddb-hexknight']);
    assert.equal(c.classId, 'ddb-hexknight'); assert.equal(c.subclassId, 'ddb-order-of-ash'); assert.equal(c.speciesId, 'ddb-moonkin');
    assert.ok(c.spells.prepared.includes('ddb-witchfire-lance'));
    assert.equal(d.hpMax, 52); assert.equal(d.speed, 35);
    assert.equal(d.saves.cha.mod, 6);
    assert.ok(d.features.some((f) => f.name === 'Ash Cloak'));
  } finally { discardPlaceholders(); }
});

test('without placeholders, unknown content is reported as missing', () => {
  const { report, placeholders } = fromDdbFields(STRANGER, { placeholders: false });
  assert.equal(placeholders, null);
  assert.ok(report.missing.some((m) => m.kind === 'Class'));
});

// A warlock laid out the way D&D Beyond's PDF orders its fields (level headers between the spell rows).
const WARLOCK = {
  CharacterName: 'Mott', 'CLASS  LEVEL': 'Warlock 3', RACE: 'Human', BACKGROUND: 'Soldier', 'EXPERIENCE POINTS': '2,400',
  STR: '10', DEX: '16', CON: '15', INT: '12', WIS: '14', CHA: '16', WisProf: '•', ChaProf: '•', AC: '14', ProfBonus: '+2', MaxHP: '24',
  AthleticsProf: 'P', IntimidationProf: 'P', HistoryProf: 'P', InvestigationProf: 'P',
  Defenses: 'Resistances - Cold \nImmunities - Magical Sleep', SaveModifiers: 'Advantage against disease',
  ProficienciesLang: '=== ARMOR === \nLight Armor \n\n=== WEAPONS === \nLongsword, Simple Weapons \n\n=== TOOLS === \nPlaying Card Set \n\n=== LANGUAGES === \nCommon, Elvish',
  FeaturesTraits1: '=== WARLOCK FEATURES === \n\n* Eldritch Invocations • PHB-2024 153 \nYou have unearthed Eldritch Invocations. \n\n   | Agonizing Blast (Eldritch Blast) • br-2024 \nYou can add your Cha. modifier bonus to the damage rolls of Eldritch Blast. \n\n   | Pact of the Blade • br-2024 \nAs a Bonus Action, you can conjure a pact weapon in your hand. \n\n      | Pact of the Blade: Conjure: 1 Bonus Action \n\n* Magical Cunning • PHB-2024 154 \nOnce per Long Rest, regain Pact slots. \n\n   | 1 / Long Rest • 1 Minute \n\n=== FEATS === \n\n* Savage Attacker • PHB-2024 201 \nRoll twice. \n\n* Soldier Ability Score Improvements • PHB-2024 185 \n\n   | Increase two scores (+2 / +1) •',
  'Wpn Name': 'Longsword', 'Wpn1 AtkBonus': '+5', 'Wpn1 Damage': '1d8+3 Slashing', 'Wpn Name 2': 'Eldritch Blast', 'Wpn2 AtkBonus': '+5', 'Wpn2 Damage': '1d10+3 Force',
  'Eq Name0': 'Leather', 'Eq Qty0': '1', 'Eq Name1': 'Longsword', 'Eq Qty1': '1',
  spellCastingClass0: 'Warlock', spellCastingAbility0: 'CHA',
  spellHeader0: '=== CANTRIPS ===', spellName0: 'Eldritch Blast', spellSource0: 'Warlock',
  spellHeader1: '=== 1st LEVEL ===', spellName1: 'Hellish Rebuke', spellSource1: 'Warlock',
  spellHeader2: '=== 2nd LEVEL ===', spellSlotHeader2: '2 Pact OO', spellName2: 'Grave Whisper', spellSource2: 'Warlock', spellCastingTime2: '1BA', spellName3: 'Hold Person', spellSource3: 'Warlock',
};

test('warlock: spell levels from headers, specific weapons, pact weapon, invocations, defenses, uses', () => {
  const { character: c, report, placeholders } = fromDdbFields(WARLOCK);
  try {
    const d = compute(c);
    assert.equal(placeholders.spells.find((x) => x.name === 'Grave Whisper').level, 2);
    assert.ok(d.proficiencies.weapons.includes('longsword'));
    const ls = d.attacks.find((a) => a.name === 'Longsword');
    assert.equal(ls.bonus, 5); assert.equal(ls.damage, '1d8+3'); assert.ok(ls.pact);
    assert.equal(d.ac, 14);
    assert.equal(d.spellDamageBonus['eldritch-blast'], 3);
    assert.ok(d.features.some((f) => f.name.startsWith('Agonizing Blast')));
    assert.ok(d.resist.includes('cold')); assert.deepEqual(d.defenses, ['Immunity: Magical Sleep']); assert.deepEqual(d.saveNotes, ['Advantage against disease']);
    assert.ok(d.resources.some((r) => r.name === 'Magical Cunning' && r.max === 1));
    assert.ok(!c.extras.feats.length && !report.created.some((x) => /Ability Score/.test(x.name)));
    assert.deepEqual(d.proficiencies.tools, ['Playing Card Set']);
    assert.deepEqual(report.diffs, [], JSON.stringify(report.diffs));
  } finally { discardPlaceholders(); }
});

test('actions box, page joins and pact-level spells', async () => {
  const { actionEntries, joinBoxes } = await import('../js/engine/ddb-import.js');
  assert.equal(joinBoxes(['push the creature', 'up to 10 ft. away.']), 'push the creature up to 10 ft. away.');
  assert.equal(joinBoxes(['* A • X 1 \n', '* B • X 2']), '* A • X 1 \n\n* B • X 2');
  const acts = actionEntries(joinBoxes(['=== ACTIONS === \nStandard Actions \n     Attack, Magic \n\n=== BONUS ACTIONS === \nPact of the Blade: Bond \n     You can create a bond. \n\nYour bond ends if you use this', 'feature again. \n\nPact of the Blade: Conjure \n     As a Bonus Action, conjure. \n\n=== SPECIAL === \nAmong the Dead \n     You learn spare the dying.']));
  assert.deepEqual(acts.map((a) => [a.kind, a.name]), [['bonus', 'Pact of the Blade: Bond'], ['bonus', 'Pact of the Blade: Conjure'], ['other', 'Among the Dead']]);
  assert.match(acts[0].desc, /use this feature again/);
  const { character: c } = fromDdbFields({ ...WARLOCK, Actions1: '=== BONUS ACTIONS === \nPact of the Blade: Conjure \n     As a Bonus Action, you can conjure a pact weapon in your hand.' });
  try {
    assert.equal(c.extras.actionKinds['pact of the blade'], 'none');
    assert.equal(c.extras.actions[0].name, 'Pact of the Blade: Conjure');
  } finally { discardPlaceholders(); }
});

test('wizard spellbook, Magic Initiate free cast and action names with uses', () => {
  const WIZ = {
    CharacterName: 'Sela', 'CLASS  LEVEL': 'Wizard 1', RACE: 'Human', BACKGROUND: 'Sage', STR: '8', DEX: '14', CON: '14', INT: '16', WIS: '12', CHA: '10', IntProf: '•', WisProf: '•',
    ArcanaProf: 'P', HistoryProf: 'P', InvestigationProf: 'P', ReligionProf: 'P', PerceptionProf: 'P',
    FeaturesTraits1: '=== WIZARD FEATURES === \n\n* Arcane Recovery • PHB-2024 166 \nRecover slots. \n\n   | 1 / Long Rest • Special \n\n=== FEATS === \n\n* Magic Initiate (Wizard) • PHB-2024 201 \n   | Intelligence •',
    Actions1: '=== SPECIAL === \nArcane Recovery • 1 / Long Rest \n     When you finish a Short Rest, you can recover expended spell slots.',
    spellCastingClass0: 'Wizard', spellCastingAbility0: 'INT',
    spellHeader0: '=== CANTRIPS ===', spellName0: 'Fire Bolt', spellSource0: 'Wizard', spellName1: 'Light', spellSource1: 'Wizard', spellName2: 'Mage Hand', spellSource2: 'Wizard',
    spellHeader1: '=== 1st LEVEL ===',
    spellName3: 'Shield', spellSource3: 'Wizard', spellName4: 'Mage Armor', spellSource4: 'Wizard', spellName5: 'Detect Magic', spellSource5: 'Wizard', spellName6: 'Feather Fall', spellSource6: 'Wizard', spellName7: 'Grease', spellSource7: 'Wizard',
    spellName8: 'Sleep', spellSource8: 'Magic Initiate (Wizard)', spellNotes8: '1/LR (Used), D: 1m, V/S/M',
  };
  const { character: c, report } = fromDdbFields(WIZ);
  try {
    const d = compute(c);
    assert.deepEqual(c.spells.spellbook, ['shield', 'mage-armor', 'detect-magic', 'feather-fall', 'grease']);
    assert.equal(c.spells.prepared.length, d.spellcasting.preparedMax);
    assert.deepEqual(report.preparePick, { max: d.spellcasting.preparedMax, spellbook: c.spells.spellbook }, 'the preview asks which spellbook spells are prepared');
    const sleep = d.grantedSpells.find((g) => g.spellId === 'sleep');
    assert.equal(sleep.freePerLongRest, 1); assert.equal(sleep.source, 'Magic Initiate (Wizard)');
    assert.equal(c.used.resources['free-sleep'], 1);
    assert.equal(c.extras.actionKinds['arcane recovery'], 'other');
    assert.ok(!c.extras.actions.some((a) => /Arcane Recovery/.test(a.name)));
  } finally { discardPlaceholders(); }
});
