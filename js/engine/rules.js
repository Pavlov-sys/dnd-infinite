// Rules engine: turns a stored character (choices only) into a full set of derived stats.
// Pure functions, no DOM — easy to unit test and reuse (e.g. in a future server or VTT plugin).
import {
  ABILITIES, SKILLS, FULL_CASTER_SLOTS, PACT_SLOTS,
  getClass, getSpecies, getBackground, getFeat, getItem, getSpell,
} from '../data/index.js';

export const mod = (score) => Math.floor((score - 10) / 2);
export const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const profBonus = (level) => 2 + Math.floor((level - 1) / 4);
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const levelForXp = (xp) => XP_TABLE.filter((t) => xp >= t).length || 1;
export const valueAt = (arr, level) => (Array.isArray(arr) ? arr[Math.max(0, Math.min(level, 20) - 1)] ?? 0 : arr);

/** Levels at which this class grants an Ability Score Improvement (or feat) / Epic Boon. */
export function featSlots(cls, level) {
  if (!cls) return [];
  const slots = (cls.asiLevels || []).filter((l) => l <= level).map((l) => ({ key: `level-${l}`, level: l, kind: 'general' }));
  if (level >= 19 && !cls.noEpicBoonSlot) slots.push({ key: 'level-19', level: 19, kind: 'epic-boon' });
  return slots;
}

/** Every feat the character has, with the key used to store its choices. */
export function featList(c) {
  const out = [];
  const bg = getBackground(c.backgroundId);
  const bgFeat = bg?.feat?.choose ? c.bgFeatId : bg?.feat?.id;
  if (bgFeat) out.push({ key: 'background', featId: bgFeat, source: `${bg.name} background`, fixed: bg.feat });
  if (c.speciesId === 'human' && c.speciesChoices?.versatile) out.push({ key: 'versatile', featId: c.speciesChoices.versatile, source: 'Human (Versatile)' });
  const cls = getClass(c.classId);
  for (const ch of cls?.choices || []) {
    if (ch.type === 'feat' && c.level >= ch.level && c.classChoices?.[ch.id]) out.push({ key: ch.id, featId: c.classChoices[ch.id], source: `${cls.name} ${ch.name}` });
  }
  if (cls?.id === 'fighter' && c.subclassId === 'champion' && c.level >= 7 && c.classChoices?.['fighting-style-2']) {
    out.push({ key: 'fighting-style-2', featId: c.classChoices['fighting-style-2'], source: 'Champion (Additional Fighting Style)' });
  }
  for (const slot of featSlots(cls, c.level)) {
    const id = c.levelFeats?.[slot.key];
    if (id) out.push({ key: slot.key, featId: id, source: `Level ${slot.level} ${slot.kind === 'epic-boon' ? 'Epic Boon' : 'feat'}` });
  }
  (c.extras?.feats || []).forEach((f, i) => out.push({ key: `extra-${i}`, featId: f.featId, source: f.source || 'Other feat' }));
  return out.map((f) => ({ ...f, feat: getFeat(f.featId), choices: c.featChoices?.[f.key] || {} })).filter((f) => f.feat);
}

/** Returns final scores plus a per-ability breakdown (base, bonus, other, override, total). */
export function abilityScores(c) {
  const scores = { ...c.abilities.base };
  const bg = getBackground(c.backgroundId);
  const caps = Object.fromEntries(ABILITIES.map((a) => [a.id, 20]));
  if (bg) {
    const b = c.abilities.bgBonus || {};
    if (b.mode === '1-1-1') (bg.anyAbilities ? (b.picks || []) : bg.abilities).forEach((a) => { if (a) scores[a] += 1; });
    else { if (b.plus2) scores[b.plus2] += 2; if (b.plus1 && b.plus1 !== b.plus2) scores[b.plus1] += 1; }
  }
  for (const a of ABILITIES) scores[a.id] = Math.min(scores[a.id], 20);
  for (const f of featList(c)) {
    const ch = f.choices;
    if (ch.asi) {
      if (ch.asi.mode === 'single' && ch.asi.a) scores[ch.asi.a] = Math.min(20, scores[ch.asi.a] + 2);
      else { if (ch.asi.a) scores[ch.asi.a] = Math.min(20, scores[ch.asi.a] + 1); if (ch.asi.b) scores[ch.asi.b] = Math.min(20, scores[ch.asi.b] + 1); }
    }
    const plus1 = f.feat.choices?.find((x) => x.type === 'ability-plus1');
    if (plus1 && ch.ability) { const max = plus1.max || 20; caps[ch.ability] = Math.max(caps[ch.ability], max); scores[ch.ability] = Math.min(max, scores[ch.ability] + 1); }
  }
  const cls = getClass(c.classId);
  if (c.level >= 20 && cls?.id === 'barbarian') { scores.str = Math.min(25, scores.str + 4); scores.con = Math.min(25, scores.con + 4); }
  if (c.level >= 20 && cls?.id === 'monk') { scores.dex = Math.min(25, scores.dex + 4); scores.wis = Math.min(25, scores.wis + 4); }
  const parts = {};
  for (const a of ABILITIES) {
    const base = c.abilities.base[a.id];
    const bonus = scores[a.id] - base;
    const other = Number(c.abilities.other?.[a.id]) || 0;
    const override = c.abilities.override?.[a.id];
    scores[a.id] = override ? Number(override) : Math.max(1, Math.min(30, scores[a.id] + other));
    parts[a.id] = { base, bonus, other, override: override || null, total: scores[a.id] };
  }
  return { scores, parts };
}

function weaponProficient(item, profs) {
  if (profs.includes(item.category) || profs.includes(item.id)) return true;
  if (item.category === 'martial' && profs.includes('martial-light') && item.props.includes('Light')) return true;
  if (item.category === 'martial' && profs.includes('martial-finesse-light') && (item.props.includes('Light') || item.props.includes('Finesse'))) return true;
  return false;
}

// ------------------------------------------------------------------ quick adjustments (c.custom)
// c.custom = { prof: { 'skill:stealth': 'expert' | 'prof' | 'half' | 'none', 'save:dex': 'prof' | 'none' },
//              bonus: { key: number }, override: { key: number }, adv: [{ id, target, kind: 'adv' | 'dis', note }] }
// keys: ac, initiative, speed, hp, skill:<id>, save:<ability>, passive:perception|insight|investigation, spell:attack, spell:dc
export const ADV_TARGETS = [
  ['save:all', 'All saving throws'], ...[['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']].map(([a, n]) => [`save:${a}`, `${n} saving throws`]),
  ['death', 'Death saving throws'], ['check:all', 'All ability checks'],
  ...[['str', 'Strength'], ['dex', 'Dexterity'], ['con', 'Constitution'], ['int', 'Intelligence'], ['wis', 'Wisdom'], ['cha', 'Charisma']].map(([a, n]) => [`check:${a}`, `${n} checks (and its skills)`]),
  ...SKILLS.map((s) => [`skill:${s.id}`, `${s.name} checks`]),
  ['initiative', 'Initiative'], ['attack:all', 'All attack rolls'], ['attack:weapon', 'Weapon attacks'], ['attack:spell', 'Spell attacks'], ['concentration', 'Concentration saves'],
];
/** Which advantage/disadvantage entries apply to a roll described by its keys. */
export function advantageFor(c, keys) {
  const list = (c.custom?.adv || []).filter((x) => keys.includes(x.target));
  return { adv: list.filter((x) => x.kind === 'adv'), dis: list.filter((x) => x.kind === 'dis') };
}
export const rollKeys = {
  skill: (s) => [`skill:${s.id}`, `check:${s.ability}`, 'check:all'],
  save: (a) => [`save:${a}`, 'save:all'],
  check: (a) => [`check:${a}`, 'check:all'],
  initiative: () => ['initiative', 'check:dex', 'check:all'],
  weapon: () => ['attack:all', 'attack:weapon'],
  spell: () => ['attack:all', 'attack:spell'],
  death: () => ['death', 'save:all'],
};

function applyCustom(c, d) {
  const cu = c.custom || {};
  const prof = cu.prof || {}; const bonus = cu.bonus || {}; const over = cu.override || {};
  const adjusted = new Set([...Object.keys(prof), ...Object.keys(bonus).filter((k) => bonus[k]), ...Object.keys(over).filter((k) => over[k] !== null && over[k] !== undefined && over[k] !== '')]);
  const fin = (key, base) => {
    let v = base + (Number(bonus[key]) || 0);
    if (over[key] !== null && over[key] !== undefined && over[key] !== '' && Number.isFinite(Number(over[key]))) v = Number(over[key]);
    return v;
  };
  for (const s of SKILLS) {
    const k = d.skills[s.id]; const p = prof[`skill:${s.id}`];
    if (p) {
      Object.assign(k, { prof: p === 'prof' || p === 'expert', expert: p === 'expert', half: p === 'half' });
      k.mod = d.mods[s.ability] + (p === 'expert' ? d.pb * 2 : p === 'prof' ? d.pb : p === 'half' ? Math.floor(d.pb / 2) : 0);
    }
    k.mod = fin(`skill:${s.id}`, k.mod);
  }
  for (const a of ABILITIES) {
    const sv = d.saves[a.id]; const p = prof[`save:${a.id}`];
    if (p) { sv.prof = p === 'prof'; sv.mod = d.mods[a.id] + (sv.prof ? d.pb : 0); }
    sv.mod = fin(`save:${a.id}`, sv.mod);
  }
  d.passivePerception = fin('passive:perception', 10 + d.skills.perception.mod);
  d.passiveInsight = fin('passive:insight', 10 + d.skills.insight.mod);
  d.passiveInvestigation = fin('passive:investigation', 10 + d.skills.investigation.mod);
  const acBefore = d.ac; d.ac = fin('ac', d.ac);
  if (d.ac !== acBefore) d.acNote = `${d.acNote}${over.ac !== undefined && over.ac !== '' && over.ac !== null ? ' (set by hand)' : ` ${fmt(d.ac - acBefore)} adjustment`}`;
  d.initiative = fin('initiative', d.initiative);
  d.speed = fin('speed', d.speed);
  d.hpMax = Math.max(1, fin('hp', d.hpMax));
  if (d.spellcasting) { d.spellcasting.attack = fin('spell:attack', d.spellcasting.attack); d.spellcasting.dc = fin('spell:dc', d.spellcasting.dc); }
  d.adjusted = adjusted;
  d.advantages = cu.adv || [];
  return d;
}

export function compute(c) { return applyCustom(c, computeBase(c)); }

function computeBase(c) {
  const cls = getClass(c.classId);
  const sub = cls?.subclasses?.find((s) => s.id === c.subclassId && c.level >= (cls.subclassLevel || 3));
  const species = getSpecies(c.speciesId);
  const bg = getBackground(c.backgroundId);
  const level = c.level || 1;
  const pb = profBonus(level);
  const { scores, parts: scoreParts } = abilityScores(c);
  const mods = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, mod(v)]));
  const feats = featList(c);
  const hasFeat = (id) => feats.some((f) => f.featId === id);
  const warnings = [];

  // Species sub-choices
  const sc = c.speciesChoices || {};
  const speciesOpt = (id) => species?.choices?.find((x) => x.id === id)?.options?.find?.((o) => o.id === sc[id]);
  const lineage = speciesOpt('lineage') || speciesOpt('legacy');

  // Class option grants (Divine Order, Primal Order)
  const grants = { armor: [], weapons: [], extraCantrips: 0 };
  for (const ch of cls?.choices || []) {
    if (ch.type === 'option' && level >= ch.level) {
      const opt = ch.options.find((o) => o.id === c.classChoices?.[ch.id]);
      if (opt?.grants) { grants.armor.push(...(opt.grants.armor || [])); grants.weapons.push(...(opt.grants.weapons || [])); grants.extraCantrips += opt.grants.extraCantrips || 0; }
      else if (!opt) warnings.push(`Choose a ${ch.name}.`);
    }
  }

  // Proficiencies
  const ex = c.extras || {};
  const armorProf = [...new Set([...(cls?.armor || []), ...grants.armor, ...(ex.armor || [])])];
  const weaponProf = [...new Set([...(cls?.weapons || []), ...grants.weapons, ...(ex.weapons || [])])];
  const tools = [...(cls?.tools || []), ...(bg?.tool && !ex.replaceBgTool ? [bg.tool] : []), ...(ex.tools || [])];
  const languages = ['Common', ...(c.languages || [])];
  if (cls?.id === 'rogue') languages.push("Thieves' Cant");
  if (cls?.id === 'druid') languages.push('Druidic');

  // Skills
  const profSkills = new Set([...(c.classSkills || []), ...(bg?.skills || [])]);
  if (sc['keen-senses']) profSkills.add(sc['keen-senses']);
  if (sc.skillful) profSkills.add(sc.skillful);
  for (const f of feats) (f.choices.skills || []).forEach((s) => profSkills.add(s));
  (ex.skills || []).forEach((s) => profSkills.add(s));
  const expertise = new Set((c.expertise || []).filter((s) => profSkills.has(s)));
  const jack = cls?.id === 'bard' && level >= 2;
  const skills = Object.fromEntries(SKILLS.map((s) => {
    const prof = profSkills.has(s.id); const expert = expertise.has(s.id);
    const bonus = mods[s.ability] + (expert ? pb * 2 : prof ? pb : jack ? Math.floor(pb / 2) : 0);
    return [s.id, { ...s, prof, expert, half: !prof && jack, mod: bonus }];
  }));
  const saveProfs = new Set(cls?.saves || []);
  if (cls?.id === 'monk' && level >= 14) ABILITIES.forEach((a) => saveProfs.add(a.id));
  if (cls?.id === 'rogue' && level >= 15) { saveProfs.add('wis'); saveProfs.add('cha'); }
  // Paladin Aura of Protection (level 6+): the paladin adds its CHA modifier (min +1) to its own saves too.
  const aura = cls?.id === 'paladin' && level >= 6 ? Math.max(1, mods.cha) : 0;
  const saves = Object.fromEntries(ABILITIES.map((a) => [a.id, { prof: saveProfs.has(a.id), mod: mods[a.id] + (saveProfs.has(a.id) ? pb : 0) + aura }]));

  // Inventory
  const inv = (c.inventory || []).map((e, idx) => {
    let item = getItem(e.itemId) || e.custom;
    if (item && (e.weight !== undefined || e.label)) item = { ...item, ...(e.weight !== undefined ? { weight: e.weight } : {}), ...(e.label ? { name: e.label } : {}) };
    return { ...e, idx, item };
  }).filter((e) => e.item);
  const armor = inv.find((e) => e.equipped && e.item.type === 'armor' && e.item.armorType !== 'shield');
  const shield = inv.find((e) => e.equipped && e.item.armorType === 'shield');

  // Armor Class
  let ac = 10 + mods.dex; let acNote = 'Unarmored (10 + DEX)';
  const unarmored = cls?.unarmoredDefense || sub?.grants?.unarmoredDefense;
  if (armor) {
    const a = armor.item;
    ac = a.ac + (a.armorType === 'light' ? mods.dex : a.armorType === 'medium' ? Math.min(2, mods.dex) : 0);
    acNote = a.name;
    if (!armorProf.includes(a.armorType)) warnings.push(`Not proficient with ${a.name}: Disadvantage on STR/DEX tests and no spellcasting.`);
    if (feats.some((f) => f.feat.effects?.armoredAC)) { ac += 1; acNote += ' + Defense'; }
  } else if (unarmored && !(cls?.id === 'monk' && shield)) {
    ac = 10 + mods.dex + mods[unarmored]; acNote = `Unarmored Defense (10 + DEX + ${unarmored.toUpperCase()})`;
  }
  if (shield) { const sb = Number(shield.item.ac) || 2; ac += sb; acNote += sb === 2 ? ' + Shield' : ` + Shield (+${sb})`; }
  if (c.acBonus) ac += Number(c.acBonus) || 0;

  // Hit Points
  const hd = cls?.hitDie || 8;
  const manualHp = c.settings?.hpType === 'manual';
  let hpMax = hd + mods.con;
  for (let lv = 2; lv <= level; lv++) {
    const r = manualHp ? Number(c.hpRolls?.[lv]) : NaN;
    hpMax += Math.max(1, (r > 0 ? Math.min(r, hd) : hd / 2 + 1) + mods.con);
  }
  hpMax += (species?.hpPerLevel || 0) * level;
  if (sub?.grants?.hpPerLevel) hpMax += sub.grants.hpPerLevel * level;
  hpMax = Math.max(level, hpMax + (Number(c.hpBonus) || 0));

  // Speed & senses
  let speed = lineage?.speed || species?.speed || 30;
  const heavy = armor?.item.armorType === 'heavy';
  if (cls?.id === 'barbarian' && level >= 5 && !heavy) speed += 10;
  if (cls?.id === 'monk' && level >= 2 && !armor && !shield) speed += valueAt([0, 10, 10, 10, 10, 15, 15, 15, 15, 20, 20, 20, 20, 25, 25, 25, 25, 30, 30, 30], level);
  if (cls?.id === 'ranger' && level >= 6 && !heavy) speed += 10;
  if (armor?.item.strReq && scores.str < armor.item.strReq) speed -= 10;
  // Exhaustion (2024): Speed drops by 5 ft per level, and D20 Tests take -2 per level (applied when rolling).
  const exhaustion = Math.max(0, Math.min(6, Number(c.exhaustion) || 0));
  speed = Math.max(0, speed - 5 * exhaustion);
  const darkvision = lineage?.darkvision || species?.darkvision || 0;
  const resist = [...new Set([...(species?.resist || []), ...(c.extras?.resist || [])])];
  const anc = speciesOpt('ancestry');
  if (anc?.resist) resist.push(anc.resist);
  if (lineage?.resist) resist.push(lineage.resist);

  // Alert, or any (homebrew) feat marked as adding Proficiency Bonus to Initiative.
  const initiative = mods.dex + (feats.some((f) => f.featId === 'alert' || f.feat?.effects?.initiativeProf) ? pb : 0);

  // Spellcasting
  let spellcasting = null;
  if (cls?.caster) {
    const k = cls.caster; const abilityMod = mods[k.ability];
    let slots = []; let pact = null;
    if (k.type === 'full') slots = FULL_CASTER_SLOTS[level - 1];
    if (k.type === 'half') slots = FULL_CASTER_SLOTS[Math.ceil(level / 2) - 1];
    if (k.type === 'third') slots = level >= 3 ? FULL_CASTER_SLOTS[Math.ceil(level / 3) - 1] : [];
    if (k.type === 'pact') { const [n, lv] = PACT_SLOTS[level - 1]; pact = { count: n, level: lv }; }
    const maxSpellLevel = pact ? pact.level : slots.length;
    spellcasting = {
      ability: k.ability, list: k.lists || k.list, mod: abilityMod, dc: 8 + pb + abilityMod, attack: pb + abilityMod,
      slots, pact, maxSpellLevel,
      cantripsMax: (k.cantrips ? valueAt(k.cantrips, level) : 0) + grants.extraCantrips,
      preparedMax: valueAt(k.prepared, level),
    };
  }
  // Spells granted by species and feats
  const grantedSpells = [];
  if (lineage?.cantrip) grantedSpells.push({ spellId: lineage.cantrip, source: lineage.name });
  if (c.speciesId === 'tiefling') grantedSpells.push({ spellId: 'thaumaturgy', source: 'Otherworldly Presence' });
  if (c.speciesId === 'gnome' && sc.lineage === 'rock') grantedSpells.push({ spellId: 'prestidigitation', source: 'Rock Gnome' });
  if (cls?.id === 'ranger') grantedSpells.push({ spellId: 'hunters-mark', source: 'Favored Enemy' });
  if (cls?.id === 'paladin' && level >= 2) grantedSpells.push({ spellId: 'divine-smite', source: "Paladin's Smite" });
  if (cls?.id === 'druid') grantedSpells.push({ spellId: 'speak-with-animals', source: 'Druidic' });
  for (const f of feats) if (f.featId === 'magic-initiate') {
    const ab = f.choices.ability || 'int';
    const list = String(f.choices.list || f.fixed?.list || '?'); const src = `Magic Initiate (${list[0].toUpperCase()}${list.slice(1)})`;
    (f.choices.cantrips || []).forEach((id) => grantedSpells.push({ spellId: id, source: src, ability: ab }));
    // The level 1 spell: cast once per Long Rest without a slot (and with slots if you have them).
    (f.choices.spell || []).forEach((id) => grantedSpells.push({ spellId: id, source: src, ability: ab, castable: true, freePerLongRest: 1 }));
  }
  for (const x of ex.spells || []) grantedSpells.push({ spellId: x.spellId, source: x.source || 'Other', castable: true, ...(x.freePerLongRest ? { freePerLongRest: x.freePerLongRest } : {}) });
  const spellDetail = (id) => getSpell(id);

  // Attacks
  const attacks = [];
  const archery = feats.some((f) => f.feat.effects?.rangedAttack);
  const monkDie = cls?.id === 'monk' ? valueAt([6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 10, 10, 10, 10, 10, 10, 12, 12, 12, 12], level) : 0;
  for (const e of inv) {
    const w = e.item; if (w.type !== 'weapon') continue;
    const monkWeapon = monkDie && w.kind === 'melee' && (w.category === 'simple' || w.props.includes('Light'));
    let ab = w.kind === 'ranged' ? 'dex' : w.props.includes('Finesse') || monkWeapon ? (mods.dex > mods.str ? 'dex' : 'str') : 'str';
    const pact = !!e.pact; // Pact of the Blade: proficient, and may use CHA
    if (pact && mods.cha > mods[ab]) ab = 'cha';
    const prof = pact || weaponProficient(w, weaponProf);
    const bonus = mods[ab] + (prof ? pb : 0) + (archery && w.kind === 'ranged' ? 2 : 0);
    let die = w.damage;
    if (monkWeapon && parseInt(die.split('d')[1] || '0', 10) < monkDie) die = `1d${monkDie}`;
    const masteries = c.classChoices?.masteries || [];
    attacks.push({
      name: w.name, bonus, damage: `${die}${mods[ab] ? fmt(mods[ab]) : ''}`, dtype: w.dtype, props: w.props,
      range: w.range || (w.props.includes('Reach') ? '10 ft' : '5 ft'), versatile: w.versatile ? `${w.versatile}${mods[ab] ? fmt(mods[ab]) : ''}` : null,
      mastery: masteries.includes(w.id) ? w.mastery : null, masteryProp: w.mastery || null, prop: w.range, prof, kind: w.kind, category: w.category, equipped: e.equipped, pact,
    });
  }
  const unarmedAb = monkDie && mods.dex > mods.str ? 'dex' : 'str';
  attacks.push({ name: 'Unarmed Strike', bonus: mods[unarmedAb] + pb, damage: monkDie ? `1d${monkDie}${fmt(mods[unarmedAb])}` : `${Math.max(0, 1 + mods.str)}`, dtype: 'bludgeoning', props: [], range: '5 ft', prof: true, kind: 'melee', unarmed: true });

  // Features
  const features = [];
  for (const ft of cls?.features || []) if (ft.level <= level) features.push({ ...ft, source: cls.name });
  for (const ft of sub?.features || []) if (ft.level <= level) features.push({ ...ft, source: sub.name });
  for (const ft of species?.traits || []) if ((ft.level || 1) <= level) features.push({ ...ft, source: species.name });
  for (const f of feats) features.push({ level: 0, name: f.feat.name, desc: f.feat.desc, text: f.feat.text, source: f.source, isFeat: true });
  for (const f of c.extras?.features || []) features.push({ level: 0, name: f.name, desc: f.desc, source: f.source || 'Other', parent: f.parent, isExtra: true });
  // Spell damage bonuses from features (Agonizing Blast adds CHA to Eldritch Blast)
  const spellDamageBonus = {};
  if (features.some((f) => /^agonizing blast/i.test(f.name))) spellDamageBonus['eldritch-blast'] = mods.cha;
  if (cls?.id === 'rogue') features.find((x) => x.name === 'Sneak Attack') && (features.find((x) => x.name === 'Sneak Attack').extra = `${Math.ceil(level / 2)}d6`);

  // Attacks per Attack action (Extra Attack and its upgrades)
  const names = new Set(features.map((f) => f.name.toLowerCase()));
  const attacksPerAction = names.has('three extra attacks') ? 4 : names.has('two extra attacks') ? 3 : [...names].some((n) => n.startsWith('extra attack')) ? 2 : 1;

  // Resources
  const resources = [...(cls?.resources || []), ...(sub?.resources || []), ...(c.extras?.resources || [])].map((r) => {
    let max = r.uses;
    if (Array.isArray(max)) max = valueAt(max, level);
    else if (typeof max === 'string') max = max === 'level' ? level : max === '5*level' ? 5 * level : max === 'pb' ? pb : /^\d+$/.test(max) ? Number(max) : Math.max(1, mods[max] ?? 1);
    return { ...r, max };
  }).filter((r) => r.max > 0);
  if (species?.id === 'dragonborn') resources.push({ id: 'breath-weapon', name: 'Breath Weapon', reset: 'long', max: pb });
  if (species?.id === 'dwarf') resources.push({ id: 'stonecunning', name: 'Stonecunning', reset: 'long', max: pb });
  if (species?.id === 'goliath') resources.push({ id: 'giant-ancestry', name: 'Giant Ancestry', reset: 'long', max: pb });
  if (species?.id === 'orc') resources.push({ id: 'adrenaline-rush', name: 'Adrenaline Rush', reset: 'short', max: pb }, { id: 'relentless-endurance', name: 'Relentless Endurance', reset: 'long', max: 1 });

  // Build completeness checks
  if (!cls) warnings.push('Choose a class.');
  if (!bg) warnings.push('Choose a background.');
  if (!species) warnings.push('Choose a species.');
  if (cls && (c.classSkills || []).length < cls.skillChoices.count) warnings.push(`Choose ${cls.skillChoices.count - (c.classSkills || []).length} more class skill(s).`);
  if (cls && level >= cls.subclassLevel && !sub) warnings.push('Choose a subclass.');
  if (!c.abilities.method) warnings.push('Choose how to generate ability scores.');
  else if (c.abilities.method === 'standard' && Object.keys(c.abilities.assigned || {}).length < 6) warnings.push('Assign all six ability scores.');
  if (bg && !c.abilities.bgBonus?.mode) warnings.push('Assign your background ability score increases.');
  for (const slot of featSlots(cls, level)) if (!c.levelFeats?.[slot.key]) warnings.push(`Choose a feat for level ${slot.level}.`);

  return {
    cls, sub, species, bg, level, pb, scores, scoreParts, mods, saves, skills, hpMax, hitDie: hd, ac, acNote, initiative, speed,
    darkvision, size: species?.size || 'Medium', resist, passivePerception: 10 + skills.perception.mod,
    passiveInsight: 10 + skills.insight.mod, passiveInvestigation: 10 + skills.investigation.mod,
    proficiencies: { armor: armorProf, weapons: weaponProf, tools, languages },
    feats, features, spellcasting, grantedSpells, spellDetail, attacks, attacksPerAction, resources, inventory: inv, warnings,
    exhaustion, d20Penalty: 2 * exhaustion, spellDamageBonus, defenses: c.extras?.defenses || [], saveNotes: [...(aura ? [`Includes +${aura} from Aura of Protection (while not Incapacitated)`] : []), ...(c.extras?.saveNotes || [])],
    actionKinds: c.extras?.actionKinds || {}, extraActions: c.extras?.actions || [],
  };
}
