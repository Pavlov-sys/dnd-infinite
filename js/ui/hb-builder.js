// The Homebrew Builder: the homebrew editors as a step-by-step flow like the character builder.
// Each kind of content gets a few short steps with big choice cards and sensible defaults; every field
// stays reachable (anything a step doesn't cover lands in "More"), and JSON is always one click away.
import { h, cap, toast, rich } from './dom.js';
import { ABILITIES, SKILLS, all, getClass, getFeat } from '../data/index.js';

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ORD = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
const DIE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
const DMG_ICON = { acid: '🧪', bludgeoning: '🔨', cold: '❄️', fire: '🔥', force: '💫', lightning: '⚡', necrotic: '💀', piercing: '🏹', poison: '☠️', psychic: '🧠', radiant: '☀️', slashing: '🗡', thunder: '🔊', healing: '💚' };
const DAMAGE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const SCHOOL_DESC = { Abjuration: 'Protection and wards', Conjuration: 'Summoning and teleporting', Divination: 'Knowledge and foresight', Enchantment: 'Charming minds', Evocation: 'Raw energy and blasts', Illusion: 'Tricking the senses', Necromancy: 'Life and death', Transmutation: 'Changing things' };
const MASTERY_DESC = { Cleave: 'Hit a second creature next to the first', Graze: 'Deal some damage even on a miss', Nick: 'Extra light-weapon attack as part of the Attack', Push: 'Push the target 10 ft', Sap: 'Target has Disadvantage on its next attack', Slow: 'Reduce the target’s Speed by 10 ft', Topple: 'Knock the target Prone (CON save)', Vex: 'Advantage on your next attack against it' };
const PROP_DESC = { Ammunition: 'Needs arrows, bolts…', Finesse: 'Use STR or DEX', Heavy: 'Small creatures have Disadvantage', Light: 'Good for two-weapon fighting', Loading: 'One shot per action', Reach: '+5 ft reach', Thrown: 'Can be thrown', 'Two-Handed': 'Needs both hands', Versatile: 'Bigger die with two hands' };
const CREATURE_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];
const CRS = [['0', 0, 10], ['1/8', 0.125, 25], ['1/4', 0.25, 50], ['1/2', 0.5, 100], ...[[1, 200], [2, 450], [3, 700], [4, 1100], [5, 1800], [6, 2300], [7, 2900], [8, 3900], [9, 5000], [10, 5900], [11, 7200], [12, 8400], [13, 10000], [14, 11500], [15, 13000], [16, 15000], [17, 18000], [18, 20000], [19, 22000], [20, 25000], [21, 33000], [22, 41000], [23, 50000], [24, 62000], [25, 75000], [26, 90000], [27, 105000], [28, 120000], [29, 135000], [30, 155000]].map(([c, xp]) => [String(c), c, xp])];
const crPb = (cr) => (cr < 5 ? 2 : cr < 9 ? 3 : cr < 13 ? 4 : cr < 17 ? 5 : cr < 21 ? 6 : cr < 25 ? 7 : cr < 29 ? 8 : 9);
const mod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
const fmtMod = (n) => (n >= 0 ? `+${n}` : `${n}`);

// ---------------------------------------------------------------- small widgets
/** Big choice cards, like the character builder's. options: [value, label, desc?, icon?] */
export function cards(options, value, pick, { cols = 'auto', multi = false, small = false } = {}) {
  const on = (v) => (multi ? (value || []).includes(v) : String(value) === String(v));
  return h(`div.option-cards.hb-cards${small ? '.small' : ''}${cols !== 'auto' ? `.c${cols}` : ''}`, {}, options.map(([v, label, desc, icon]) =>
    h(`button.option-card${on(v) ? '.on' : ''}`, { type: 'button', 'aria-pressed': on(v) ? 'true' : 'false', onclick: () => pick(v) },
      h('b', {}, icon ? h('span.oc-ico', { 'aria-hidden': 'true' }, icon) : null, label), desc ? h('span', {}, desc) : null)));
}
const q = (title, hint, ...body) => h('div.hb-q', {}, h('h3', {}, title), hint ? h('p.muted.tiny', {}, hint) : null, ...body);
const custom = (value, set, placeholder, width = '14em') => h('input.hb-custom', { value: value ?? '', placeholder, style: { width }, oninput: (e) => set(e.target.value) });
const toggle = (label, value, set, hint) => h('label.hb-toggle', { title: hint || '' }, h('input', { type: 'checkbox', checked: !!value, onchange: (e) => set(e.target.checked) }), h('span', {}, label));

/** Pick "2d6" style dice: count stepper + die buttons; the text box still takes anything. */
function dicePicker(value, set, { allowBlank = true } = {}) {
  const m = String(value || '').match(/^(\d+)d(\d+)/);
  const n = m ? Number(m[1]) : 1; const die = m ? `d${m[2]}` : null;
  const rest = m ? String(value).slice(m[0].length) : '';
  const put = (nn, dd) => set(`${Math.max(1, nn)}${dd}${rest}`);
  return h('div.hb-dice', {},
    h('div.stepper', {}, h('button', { type: 'button', 'aria-label': 'Fewer dice', onclick: () => put(n - 1, die || 'd6') }, '−'), h('b', {}, n), h('button', { type: 'button', 'aria-label': 'More dice', onclick: () => put(n + 1, die || 'd6') }, '+')),
    h('div.die-row', {}, DIE.map((d) => h(`button.die-btn${die === d ? '.on' : ''}`, { type: 'button', onclick: () => put(n, d) }, d))),
    h('input.hb-custom', { value: value || '', placeholder: allowBlank ? 'none' : '1d8', style: { width: '9em' }, title: 'Or type any dice expression', onchange: (e) => set(e.target.value) }));
}

// ---------------------------------------------------------------- the step plans
// A step is { id, label, keys: [field keys rendered with the normal field widgets], render?(ctx) }.
// Fields a plan doesn't mention are shown in an automatic "More" step, so nothing is ever out of reach.
const PLANS = {
  spells: [
    { id: 'basics', label: 'Basics', covers: ['name'], render: ({ d, set, field, F }) => [
      field(F.name),
      q('Spell level', 'Cantrips can be cast at will; leveled spells use a spell slot of that level or higher.',
        cards(SPELL_LEVELS.map((l) => [l, l ? `${ORD(l)} level` : 'Cantrip']), d.level ?? 1, (v) => set('level', v), { small: true, cols: 5 })),
      q('School of magic', null, cards(Object.entries(SCHOOL_DESC).map(([k, v]) => [k, k, v]), d.school || 'Evocation', (v) => set('school', v), { small: true })),
    ] },
    { id: 'casting', label: 'Casting', render: ({ d, set }) => {
      const comp = parseComponents(d.components);
      const setComp = (patch) => set('components', joinComponents({ ...comp, ...patch }));
      return [
        q('Casting time', null, cards([['Action', 'Action'], ['Bonus Action', 'Bonus Action'], ['Reaction', 'Reaction'], ['1 minute', '1 minute'], ['10 minutes', '10 minutes'], ['1 hour', '1 hour']], d.time || 'Action', (v) => set('time', v), { small: true, cols: 6 }),
          h('div.hb-or', {}, 'or ', custom(['Action', 'Bonus Action', 'Reaction', '1 minute', '10 minutes', '1 hour'].includes(d.time) ? '' : d.time, (v) => set('time', v, false), 'Custom, e.g. Reaction, when you take damage', '24em'))),
        q('Range', null, cards([['Self', 'Self'], ['Touch', 'Touch'], ['30 feet', '30 ft'], ['60 feet', '60 ft'], ['90 feet', '90 ft'], ['120 feet', '120 ft']], d.range || '60 feet', (v) => set('range', v), { small: true, cols: 6 }),
          h('div.hb-or', {}, 'or ', custom(['Self', 'Touch', '30 feet', '60 feet', '90 feet', '120 feet'].includes(d.range) ? '' : d.range, (v) => set('range', v, false), 'Custom, e.g. Self (15-foot cone)', '24em'))),
        q('Components', 'Verbal (spoken words), Somatic (hand gestures), Material (an object you hold).',
          h('div.hb-toggles', {}, toggle('Verbal (V)', comp.v, (x) => setComp({ v: x })), toggle('Somatic (S)', comp.s, (x) => setComp({ s: x })), toggle('Material (M)', comp.m, (x) => setComp({ m: x }))),
          comp.m ? custom(comp.mat, (x) => setComp({ mat: x }), 'What material? e.g. a pinch of soot', '24em') : null),
        q('Duration', null, cards([['Instantaneous', 'Instantaneous'], ['1 round', '1 round'], ['1 minute', '1 minute'], ['10 minutes', '10 minutes'], ['1 hour', '1 hour'], ['8 hours', '8 hours'], ['24 hours', '24 hours'], ['Until dispelled', 'Until dispelled']], d.duration || 'Instantaneous', (v) => set('duration', v), { small: true, cols: 4 }),
          h('div.hb-toggles', {}, toggle('Concentration', d.concentration, (x) => set('concentration', x), 'The caster must concentrate to keep it going'), toggle('Ritual', d.ritual, (x) => set('ritual', x), 'Can be cast as a ritual (10 minutes longer, no slot)'))),
      ];
    } },
    { id: 'effect', label: 'Effect', render: ({ d, set }) => {
      const roll = d.attack ? 'attack' : d.save ? 'save' : d._roll || 'none';
      const dm = String(d.damage || '').match(/^(\S+)\s*(.*)$/) || [];
      const dice = dm[1] && /\d*d\d+/.test(dm[1]) ? dm[1] : ''; const kind = (dm[2] || '').trim();
      const setDamage = (dc, k) => set('damage', dc ? `${dc}${k ? ` ${k}` : ''}` : undefined);
      const lvl = Number(d.level ?? 1);
      const upDie = (dice.match(/d\d+/) || ['d6'])[0];
      const autoUp = d._up && lvl > 0 ? `The ${kind === 'healing' ? 'healing' : 'damage'} increases by ${d._upN || 1}${upDie} for each spell slot level above ${ORD(lvl)}.` : '';
      return [
        q('How does it affect a target?', 'This sets up the roll buttons on the character sheet.',
          cards([['attack', 'Spell attack', 'Roll to hit, like a weapon', '🎯'], ['save', 'Saving throw', 'The target rolls to resist', '🛡'], ['none', 'No roll', 'It just happens (buffs, utility, healing)', '✨']], roll, (v) => { set('attack', v === 'attack' || undefined, false); set('save', v === 'save' ? d.save || 'dex' : undefined, false); set('_roll', v); }, { cols: 3 })),
        roll === 'save' ? q('Which saving throw?', null, cards(ABILITIES.map((a) => [a.id, a.name]), d.save || 'dex', (v) => set('save', v), { small: true, cols: 6 })) : null,
        q('Damage or healing', 'Leave the dice empty if it doesn’t deal damage or heal.',
          dicePicker(dice, (v) => setDamage(v, kind || 'fire')),
          dice ? cards([...DAMAGE, 'healing'].map((t) => [t, cap(t), null, DMG_ICON[t]]), kind || 'fire', (v) => setDamage(dice, v), { small: true, cols: 7 }) : null,
          dice ? h('div.row', {}, h('button.btn.small', { type: 'button', onclick: () => setDamage('', '') }, 'No damage')) : null),
        dice && lvl > 0 ? q('Stronger with a higher-level slot?', null,
          h('div.hb-toggles', {}, toggle(`Yes: +${d._upN || 1}${upDie} per slot level above ${ORD(lvl)}`, d._up, (x) => { set('_up', x, false); if (x) set('higherLevel', `The ${kind === 'healing' ? 'healing' : 'damage'} increases by ${d._upN || 1}${upDie} for each spell slot level above ${ORD(lvl)}.`); })),
          d._up ? h('div.stepper.inline', {}, h('span.muted.tiny', {}, 'Dice per level: '), h('button', { type: 'button', onclick: () => { set('_upN', Math.max(1, (d._upN || 1) - 1), false); set('higherLevel', autoUp.replace(/by \d+d/, `by ${Math.max(1, (d._upN || 1) - 1)}d`)); } }, '−'), h('b', {}, d._upN || 1), h('button', { type: 'button', onclick: () => { set('_upN', (d._upN || 1) + 1, false); set('higherLevel', autoUp.replace(/by \d+d/, `by ${(d._upN || 1) + 1}d`)); } }, '+')) : null) : null,
        dice && lvl === 0 ? h('p.muted.tiny', {}, 'Cantrip damage grows automatically at character levels 5, 11 and 17.') : null,
      ];
    } },
    { id: 'text', label: 'Description', keys: ['desc', 'higherLevel'], intro: 'Write the rules text the way it should read on the sheet. Bold with **text**.' },
    { id: 'lists', label: 'Spell Lists', keys: ['classes'], intro: 'Which classes can learn this spell? Leave empty to only add it to sheets by hand.' },
  ],
  items: [
    { id: 'kind', label: 'Kind', render: ({ d, set, setMany }) => [
      q('What are you making?', null, cards([
        ['weapon', 'Weapon', 'Swords, bows, guns…', '🗡'], ['armor', 'Armor', 'Worn for AC', '🛡'], ['shield', 'Shield', '+AC in one hand', '🔰'],
        ['clothing', 'Clothing', 'Outfits, cloaks, boots', '🧥'], ['gear', 'Gear', 'Adventuring equipment', '🎒'], ['tool', 'Tool or kit', 'Instruments, supplies', '🔧'],
        ['magic-item', 'Magic item', 'Rings, wands, wondrous items', '🔮']], itemKind(d), (v) => setMany(kindPatch(v)), { cols: 4 })),
    ] },
    { id: 'basics', label: 'Basics', keys: ['name', 'desc'] },
    { id: 'stats', label: 'Stats', when: (d) => ['weapon', 'armor', 'magic-item'].includes(d.type), render: ({ d, set }) => {
      if (d.type === 'weapon') return [
        q('Simple or martial?', 'Simple weapons are usable by almost everyone; martial weapons need training.', cards([['simple', 'Simple', 'Clubs, daggers, crossbows'], ['martial', 'Martial', 'Swords, axes, longbows']], d.category || 'martial', (v) => set('category', v), { cols: 2 })),
        q('Melee or ranged?', null, cards([['melee', 'Melee', 'Hit things next to you', '⚔'], ['ranged', 'Ranged', 'Shoot from a distance', '🏹']], d.kind || 'melee', (v) => set('kind', v), { cols: 2 })),
        q('Damage', null, dicePicker(d.damage || '1d8', (v) => set('damage', v), { allowBlank: false }),
          cards(DAMAGE.map((t) => [t, cap(t), null, DMG_ICON[t]]), d.dtype || 'slashing', (v) => set('dtype', v), { small: true, cols: 7 })),
        q('Properties', 'Pick any that apply.', cards(Object.entries(PROP_DESC).map(([k, v]) => [k, k, v]), d.props || [], (v) => set('props', (d.props || []).includes(v) ? d.props.filter((x) => x !== v) : [...(d.props || []), v]), { multi: true, small: true })),
        (d.kind === 'ranged' || (d.props || []).includes('Thrown')) ? q('Range', 'Normal / long range in feet.', custom(d.range, (v) => set('range', v, false), 'e.g. 80/320', '9em')) : null,
        (d.props || []).includes('Versatile') ? q('Two-handed damage', null, dicePicker(d.versatile || '1d10', (v) => set('versatile', v), { allowBlank: false })) : null,
        q('Weapon Mastery', 'The extra effect a character with Weapon Mastery gets.', cards(Object.entries(MASTERY_DESC).map(([k, v]) => [k, k, v]), d.mastery, (v) => set('mastery', d.mastery === v ? undefined : v), { small: true })),
      ];
      if (d.type === 'armor') return [
        d.armorType !== 'shield' ? q('How heavy is it?', null, cards([['light', 'Light', 'AC + your DEX'], ['medium', 'Medium', 'AC + DEX (max +2)'], ['heavy', 'Heavy', 'Flat AC, no DEX']], d.armorType || 'light', (v) => set('armorType', v), { cols: 3 })) : null,
        q(d.armorType === 'shield' ? 'AC bonus' : 'Base Armor Class', d.armorType === 'shield' ? 'A normal shield gives +2.' : 'Leather is 11, chain shirt 13, plate 18.',
          h('div.stepper', {}, h('button', { type: 'button', onclick: () => set('ac', Math.max(0, (Number(d.ac) || 10) - 1)) }, '−'), h('b', {}, Number(d.ac) || (d.armorType === 'shield' ? 2 : 11)), h('button', { type: 'button', onclick: () => set('ac', (Number(d.ac) || 10) + 1) }, '+'))),
        d.armorType === 'heavy' ? q('Strength needed', 'Below this, the wearer’s Speed drops by 10 ft.', cards([[0, 'None'], [13, 'STR 13'], [15, 'STR 15'], [17, 'STR 17']], Number(d.strReq) || 0, (v) => set('strReq', v), { small: true, cols: 4 })) : null,
        d.armorType !== 'shield' ? h('div.hb-toggles', {}, toggle('Disadvantage on Stealth checks', d.stealthDis, (x) => set('stealthDis', x))) : null,
      ];
      return [
        q('Rarity', null, cards(['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'].map((r) => [r, r]), d.rarity || 'Uncommon', (v) => set('rarity', v), { small: true, cols: 6 })),
        q('Category', null, cards(['Wondrous Items', 'Armor', 'Weapons', 'Potions', 'Rings', 'Rods', 'Scrolls', 'Staffs', 'Wands'].map((r) => [r, r]), d.category || 'Wondrous Items', (v) => set('category', v), { small: true, cols: 5 })),
        h('div.hb-toggles', {}, toggle('Requires attunement', d.attunement, (x) => set('attunement', x))),
      ];
    } },
    { id: 'value', label: 'Cost & Weight', keys: ['cost', 'weight'] },
  ],
  species: [
    { id: 'basics', label: 'Basics', keys: ['name', 'desc'] },
    { id: 'body', label: 'Body', render: ({ d, set, field, F }) => [
      q('Size', null, cards(['Small', 'Medium', 'Large'].map((s) => [s, s]), d.size || 'Medium', (v) => set('size', v), { cols: 3 })),
      q('Walking speed', null, cards([[25, '25 ft', 'Slow'], [30, '30 ft', 'Normal'], [35, '35 ft', 'Fast']], Number(d.speed) || 30, (v) => set('speed', v), { cols: 3 })),
      q('Darkvision', 'See in dim light as if it were bright, and darkness as dim.', cards([[0, 'None'], [60, '60 ft'], [120, '120 ft']], Number(d.darkvision) || 0, (v) => set('darkvision', v), { cols: 3 })),
      field(F.hpPerLevel),
    ] },
    { id: 'traits', label: 'Traits', render: ({ d, set, field, F }) => [
      q('Quick add', 'Adds a trait with starter text you can edit.', h('div.row.wrap', {}, SPECIES_TRAITS.map(([name, text]) => h('button.btn.small', { type: 'button', onclick: () => set('traits', [...(d.traits || []), { level: 1, name, desc: text }]) }, `＋ ${name}`)))),
      field(F.traits), field(F.resist),
    ] },
  ],
  backgrounds: [
    { id: 'basics', label: 'Basics', keys: ['name', 'desc'] },
    { id: 'abilities', label: 'Ability Scores', keys: ['abilities'], intro: 'A character with this background raises these scores (+2/+1 or +1/+1/+1).' },
    { id: 'feat', label: 'Origin Feat', render: ({ d, set, field, F }) => [
      q('Which origin feat does it grant?', null, cards(all('feats').filter((f) => f.category === 'origin').map((f) => [f.id, f.name, (f.desc || '').slice(0, 70)]), d.featId, (v) => set('featId', v), { small: true })),
      d.featId === 'magic-initiate' ? field(F.featList) : null,
    ] },
    { id: 'skills', label: 'Skills & Tool', keys: ['skills', 'tool'] },
    { id: 'gear', label: 'Equipment', keys: ['kit', 'kitGp'], intro: 'Option A is this gear; option B is always 50 GP.' },
  ],
  feats: [
    { id: 'basics', label: 'Basics', covers: ['name'], render: ({ d, set, field, F }) => [
      field(F.name),
      q('Kind of feat', null, cards([['origin', 'Origin', 'Taken at level 1 from a background'], ['general', 'General', 'Taken at Ability Score Improvement levels'], ['fighting-style', 'Fighting Style', 'For classes with Fighting Style'], ['epic-boon', 'Epic Boon', 'Level 19+']], d.category || 'general', (v) => set('category', v), { cols: 4 })),
      field(F.prereq),
    ] },
    { id: 'benefits', label: 'Benefits', render: ({ d, set }) => [
      q('Ability score increase', 'Most general feats give +1 to one score.', cards([['', 'None'], ['any', 'Any ability'], ['str,dex', 'STR or DEX'], ['con', 'CON'], ['int,wis,cha', 'INT, WIS or CHA']], d.plusOne || '', (v) => set('plusOne', v || undefined), { small: true, cols: 5 })),
      q('Skill proficiencies', 'The player picks this many skills.', cards([[0, 'None'], [1, '1 skill'], [2, '2 skills'], [3, '3 skills']], Number(d.skillCount) || 0, (v) => set('skillCount', v), { small: true, cols: 4 })),
      h('div.hb-toggles', {}, toggle('Add Proficiency Bonus to Initiative', d.initiativeProf, (x) => set('initiativeProf', x))),
    ] },
    { id: 'text', label: 'Description', keys: ['text'], intro: 'Describe what the feat does. Anything the sheet can’t automate still shows here for the player.' },
  ],
  subclasses: [
    { id: 'class', label: 'Class', covers: ['classId'], render: ({ d, set }) => [q('Which class is this a subclass of?', null, cards(all('classes').map((c) => [c.id, c.name, c.tagline]), d.classId, (v) => set('classId', v), { small: true }))] },
    { id: 'basics', label: 'Basics', keys: ['name', 'desc', 'text'] },
    { id: 'features', label: 'Features', render: ({ d, set, field, F }) => {
      const levels = subclassLevels(d.classId);
      const have = new Set((d.features || []).map((f) => Number(f.level)));
      return [
        levels.length ? q(`${getClass(d.classId)?.name || 'This class'} gets subclass features at levels ${levels.join(', ')}`, 'Add one for each level (or more). Empty ones are skipped when you save.',
          h('div.row.wrap', {}, levels.map((lv) => h(`button.btn.small${have.has(lv) ? '.done' : ''}`, { type: 'button', onclick: () => { set('features', [...(d.features || []), { level: lv, name: '', desc: '' }]); focusNewRow(); } }, `${have.has(lv) ? '✓' : '＋'} Level ${lv}`)))) : null,
        field(F.features),
      ];
    } },
  ],
  monsters: [
    { id: 'basics', label: 'Basics', covers: ['name'], render: ({ d, set, field, F }) => [
      field(F.name),
      q('Size', null, cards(['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'].map((s) => [s, s]), d.size || 'Medium', (v) => set('size', v), { small: true, cols: 6 })),
      q('Creature type', null, cards(CREATURE_TYPES.map((t) => [t, cap(t)]), d.kind || 'humanoid', (v) => set('kind', v), { small: true, cols: 7 }), h('div.hb-or', {}, 'or ', custom(CREATURE_TYPES.includes(d.kind) ? '' : d.kind, (v) => set('kind', v, false), 'e.g. humanoid (goblinoid)', '16em'))),
      field(F.alignment),
    ] },
    { id: 'stats', label: 'Stats', render: ({ d, set, field, F }) => {
      const hd = String(d.hitDice || '').match(/^(\d+)d(\d+)/);
      const avg = hd ? Math.floor(Number(hd[1]) * (Number(hd[2]) + 1) / 2) + Number(hd[1]) * mod((d.scores || [])[2]) : null;
      return [
        field(F.scores),
        h('div.grid2', {}, field(F.ac), field(F.speed)),
        q('Hit Points', 'Pick hit dice and the average is worked out with the CON modifier.',
          dicePicker(hd ? hd[0] : '', (v) => { const m = v.match(/^(\d+)d(\d+)/); const c = mod((d.scores || [])[2]); set('hitDice', m ? `${v}${c ? ` ${c > 0 ? '+' : '-'} ${Math.abs(c * Number(m[1]))}` : ''}` : v, false); if (m) set('hp', Math.max(1, Math.floor(Number(m[1]) * (Number(m[2]) + 1) / 2) + Number(m[1]) * c)); else set('hp', d.hp); }),
          field(F.hp), avg !== null && avg !== Number(d.hp) ? h('p.muted.tiny', {}, `Average for ${d.hitDice}: ${avg}`) : null),
      ];
    } },
    { id: 'senses', label: 'Senses & CR', render: ({ d, set, field, F }) => [
      q('Challenge rating', 'XP is filled in for you.', cards(CRS.map(([l, v, xp]) => [v, l, `${xp.toLocaleString()} XP`]), d.cr ?? 1, (v) => { set('cr', v, false); set('xp', CRS.find((c) => c[1] === v)[2]); }, { small: true, cols: 8 })),
      h('div.grid2', {}, field(F.senses), field(F.languages)),
      field(F.resist), field(F.immune),
    ] },
    { id: 'actions', label: 'Actions', render: ({ d, set, field, F }) => {
      const pb = crPb(Number(d.cr) || 0); const s = d.scores || [];
      const atk = (ab, reach) => { const m = Math.max(mod(s[0]), ab === 'dex' ? mod(s[1]) : -9); return `${reach ? 'Melee' : 'Ranged'} Attack Roll: ${fmtMod(m + pb)}, ${reach ? 'reach 5 ft' : 'range 80/320 ft'}. Hit: ${Math.max(1, 4 + m)} (1d6 ${m >= 0 ? '+' : '−'} ${Math.abs(m)}) ${reach ? 'Slashing' : 'Piercing'} damage.`; };
      return [
        q('Quick add', `Starter text uses this creature’s scores and its Proficiency Bonus (+${pb} at CR ${d.cr ?? 1}). Edit the numbers to taste.`, h('div.row.wrap', {},
          h('button.btn.small', { type: 'button', onclick: () => set('actions', [...(d.actions || []), { name: 'Claw', desc: atk('str', true) }]) }, '＋ Melee attack'),
          h('button.btn.small', { type: 'button', onclick: () => set('actions', [...(d.actions || []), { name: 'Shortbow', desc: atk('dex', false) }]) }, '＋ Ranged attack'),
          h('button.btn.small', { type: 'button', onclick: () => set('actions', [{ name: 'Multiattack', desc: `The ${(d.name || 'creature').toLowerCase()} makes two attacks.` }, ...(d.actions || [])]) }, '＋ Multiattack'),
          h('button.btn.small', { type: 'button', onclick: () => set('actions', [...(d.actions || []), { name: 'Fire Breath (Recharge 5–6)', desc: `Dexterity Saving Throw: DC ${8 + pb + mod(s[2])}, each creature in a 15-foot Cone. Failure: 21 (6d6) Fire damage. Success: Half damage.` }]) }, '＋ Breath weapon'))),
        field(F.actions), field(F.traits), field(F.bonusActions), field(F.reactions), field(F.legendary),
      ];
    } },
  ],
  classes: [
    { id: 'basics', label: 'Basics', covers: ['name'], render: ({ d, set, field, F }) => [
      field(F.name), field(F.tagline), field(F.desc),
      q('Hit die', 'Sets hit points per level. Wizards use d6, fighters d10, barbarians d12.', cards([[6, 'd6', 'Fragile'], [8, 'd8', 'Average'], [10, 'd10', 'Tough'], [12, 'd12', 'Very tough']], Number(d.hitDie) || 10, (v) => set('hitDie', v), { cols: 4 })),
      q('Primary ability', 'The score this class relies on most (pick up to 2).', cards(ABILITIES.map((a) => [a.id, a.name]), d.primary || [], (v) => set('primary', pickUpTo(d.primary, v, 2)), { multi: true, small: true, cols: 6 })),
    ] },
    { id: 'profs', label: 'Proficiencies', render: ({ d, set }) => [
      q('Saving throws', 'Every class is proficient in two.', cards(ABILITIES.map((a) => [a.id, a.name]), d.saves || [], (v) => set('saves', pickUpTo(d.saves, v, 2)), { multi: true, small: true, cols: 6 })),
      q('Armor training', null, cards([['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy'], ['shield', 'Shields']], d.armor || [], (v) => set('armor', flip(d.armor, v)), { multi: true, small: true, cols: 4 })),
      q('Weapons', null, cards([['simple', 'Simple weapons'], ['martial', 'Martial weapons']], d.weapons || [], (v) => set('weapons', flip(d.weapons, v)), { multi: true, small: true, cols: 2 })),
      q('Tools', 'Comma-separated, e.g. Thieves’ Tools, one musical instrument.', custom((d.tools || []).join(', '), (v) => set('tools', v.split(',').map((x) => x.trim()).filter(Boolean), false), 'none', '24em')),
      q('Skills', 'How many skills a new character picks, and from which list.',
        cards([[1, '1'], [2, '2'], [3, '3'], [4, '4']], Number(d.skillCount) || 2, (v) => set('skillCount', v), { small: true, cols: 4 }),
        cards(SKILLS.map((s) => [s.id, s.name]), d.skillFrom || [], (v) => set('skillFrom', flip(d.skillFrom, v)), { multi: true, small: true, cols: 6 }),
        h('div.row', {}, h('button.btn.small', { type: 'button', onclick: () => set('skillFrom', SKILLS.map((s) => s.id)) }, 'Any skill'), h('button.btn.small', { type: 'button', onclick: () => set('skillFrom', []) }, 'Clear'))),
      q('Weapon Mastery', 'How many weapons a character can use the mastery properties of (martial classes get 2–3).', cards([[0, 'None'], [2, '2'], [3, '3'], [4, '4']], Number(d.masteries) || 0, (v) => set('masteries', v), { small: true, cols: 4 })),
    ] },
    { id: 'magic', label: 'Spellcasting', render: ({ d, set }) => {
      const t = d.casterType || 'none';
      return [
        q('Does this class cast spells?', null, cards([
          ['none', 'No spells', 'A martial class'], ['full', 'Full caster', 'Spell slots up to 9th level (like a wizard)'], ['half', 'Half caster', 'Up to 5th level (like a paladin)'],
          ['third', 'Third caster', 'From level 3, up to 4th level'], ['pact', 'Pact magic', 'Few slots that return on a Short Rest (like a warlock)']], t, (v) => set('casterType', v), { cols: 3 })),
        t !== 'none' ? [
          q('Spellcasting ability', null, cards(['int', 'wis', 'cha'].map((a) => [a, ABILITIES.find((x) => x.id === a).name]), d.casterAbility || 'int', (v) => set('casterAbility', v), { cols: 3 })),
          q('Spell list', 'Use an existing class’s list, or give it its own: then any spell you tick this class on (in the spell builder) appears for it.',
            cards([['own', 'Its own list', 'Pick spells for it in the spell builder', '📖'], ...all('classes').filter((c) => c.caster).map((c) => [c.id, `${c.name} list`])], d.casterList || 'own', (v) => set('casterList', v), { small: true })),
          q('Cantrips at level 1', 'They go up by one at levels 4 and 10.', cards([[0, 'None'], [2, '2'], [3, '3'], [4, '4']], Number(d.cantrips1) || 0, (v) => set('cantrips1', v), { small: true, cols: 4 })),
        ] : null,
      ];
    } },
    { id: 'levels', label: 'Levels & Features', render: ({ d, set, field, F }) => {
      const asi = d.asiLevels || [4, 8, 12, 16];
      const feats = d.features || [];
      return [
        q('When do characters choose their subclass?', null, cards([[1, 'Level 1'], [2, 'Level 2'], [3, 'Level 3']], Number(d.subclassLevel) || 3, (v) => set('subclassLevel', v), { small: true, cols: 3 }),
          custom(d.subclassTitle, (v) => set('subclassTitle', v, false), 'What subclasses are called, e.g. Arcane Tradition', '22em')),
        q('Ability Score Improvement levels', 'Standard is 4, 8, 12, 16 (fighters and rogues get extra). Level 19 always gives an Epic Boon.',
          h('div.lvl-grid', {}, Array.from({ length: 18 }, (_, i) => i + 1).map((lv) => h(`button.lvl-btn${asi.includes(lv) ? '.on' : ''}`, { type: 'button', onclick: () => set('asiLevels', flip(asi, lv).sort((a, b) => a - b)) }, lv)))),
        q('Class features by level', 'Add features at the levels they’re gained.',
          h('div.class-levels', {}, Array.from({ length: 20 }, (_, i) => i + 1).map((lv) => {
            const here = feats.filter((f) => Number(f.level) === lv);
            const auto = [lv === (Number(d.subclassLevel) || 3) ? `${d.subclassTitle || 'Subclass'}` : null, asi.includes(lv) ? 'Ability Score Improvement' : null, lv === 19 ? 'Epic Boon' : null].filter(Boolean);
            return h('div.cl-row', {}, h('b.cl-lv', {}, lv), h('div.cl-feats', {}, auto.map((a) => h('span.pill.auto', {}, a)), here.map((f) => h('span.pill', {}, f.name || '(unnamed)'))),
              h('button.btn.small', { type: 'button', title: `Add a feature at level ${lv}`, 'aria-label': `Add a feature at level ${lv}`, onclick: () => { set('features', [...feats, { level: lv, name: '', desc: '' }]); focusNewRow(); } }, '＋'));
          }))),
        field(F.features),
      ];
    } },
    { id: 'resources', label: 'Resources & Gear', render: ({ d, field, F }) => [
      q('Limited-use features', 'Things like Rage or Channel Divinity. Uses can be a number, "pb" (Proficiency Bonus), "level", or an ability (e.g. "cha" for its modifier).', field(F.resources)),
      q('Starting equipment', 'Option A is this gear plus gold; option B is just gold.', field(F.kit), h('div.grid2', {}, field(F.kitGp), field(F.goldB))),
    ] },
  ],
};

const SPECIES_TRAITS = [
  ['Darkvision', 'You have Darkvision with a range of 60 feet.'],
  ['Resistance', 'You have Resistance to Fire damage.'],
  ['Skill Training', 'You have proficiency in the Perception skill.'],
  ['Natural Weapon', 'Your claws are natural weapons you can use to make Unarmed Strikes. When you hit with them, you deal 1d6 + your Strength modifier Slashing damage.'],
  ['Breath Weapon', 'As a Magic action, you exhale energy in a 15-foot Cone. Each creature in it makes a Dexterity saving throw (DC 8 + your Constitution modifier + your Proficiency Bonus), taking 1d10 Fire damage on a failure or half as much on a success. The damage increases at levels 5, 11 and 17. You can use this a number of times equal to your Proficiency Bonus, regaining all uses on a Long Rest.'],
  ['Innate Spell', 'You know the Light cantrip. Charisma is your spellcasting ability for it.'],
  ['Flight', 'You have a Fly Speed equal to your Speed. You can’t use it while wearing Medium or Heavy armor.'],
  ['Lucky', 'When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you must use the new roll.'],
];

// ---------------------------------------------------------------- helpers
/** After adding a row, bring its name box into view and focus it. */
const focusNewRow = () => setTimeout(() => { const rows = [...document.querySelectorAll('.hb-form .hb-rows')].pop(); const inp = rows?.lastElementChild?.querySelectorAll('input')[1] || rows?.lastElementChild?.querySelector('input'); if (inp) { inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); inp.focus({ preventScroll: true }); } }, 30);
const flip = (arr, v) => ((arr || []).includes(v) ? arr.filter((x) => x !== v) : [...(arr || []), v]);
const pickUpTo = (arr, v, n) => { const a = arr || []; if (a.includes(v)) return a.filter((x) => x !== v); return [...a, v].slice(-n); };
function parseComponents(s) {
  const str = String(s ?? 'V, S');
  const mat = (str.match(/M\s*\(([^)]*)\)/) || [])[1] || '';
  const head = str.replace(/\([^)]*\)/g, '');
  return { v: /\bV\b/.test(head), s: /\bS\b/.test(head), m: /\bM\b/.test(head), mat };
}
const joinComponents = ({ v, s, m, mat }) => [v ? 'V' : null, s ? 'S' : null, m ? `M${mat ? ` (${mat})` : ''}` : null].filter(Boolean).join(', ');
function itemKind(d) {
  if (d.type === 'armor' && d.armorType === 'shield') return 'shield';
  if (d.type === 'gear' && d.clothing) return 'clothing';
  if (d.type === 'gear' && d.subtype === 'other-tools') return 'tool';
  return d.type || 'gear';
}
function kindPatch(k) {
  const base = { clothing: undefined, subtype: undefined };
  if (k === 'shield') return { ...base, type: 'armor', armorType: 'shield', ac: 2 };
  if (k === 'armor') return { ...base, type: 'armor', armorType: 'light', ac: 11 };
  if (k === 'clothing') return { ...base, type: 'gear', clothing: true };
  if (k === 'tool') return { ...base, type: 'gear', subtype: 'other-tools' };
  if (k === 'weapon') return { ...base, type: 'weapon', category: 'martial', kind: 'melee', damage: '1d8', dtype: 'slashing', props: [] };
  return { ...base, type: k };
}
function subclassLevels(classId) {
  const c = getClass(classId); if (!c) return [];
  const lv = new Set();
  for (const s of c.subclasses || []) for (const f of s.features || []) lv.add(Number(f.level));
  if (!lv.size && c.subclassLevel) lv.add(c.subclassLevel);
  return [...lv].filter(Boolean).sort((a, b) => a - b);
}

/** Steps for a type: start, the plan, an automatic "More" for any field the plan doesn't place, review. */
export function stepsFor(type, d, fields) {
  const plan = (PLANS[type] || [{ id: 'details', label: 'Details', keys: fields.map((f) => f.k) }]).filter((s) => !s.when || s.when(d));
  const placed = new Set(plan.flatMap((s) => s.keys || []).concat(PLACED[type] || []));
  const extra = fields.filter((f) => !placed.has(f.k)).map((f) => f.k);
  return [{ id: 'start', label: 'Start' }, ...plan, ...(extra.length ? [{ id: 'more', label: 'More', keys: extra, intro: 'Everything else you can set.' }] : []), { id: 'review', label: 'Review' }];
}
// Keys rendered by custom step renderers (so they don't also show up in "More").
const PLACED = {
  spells: ['name', 'level', 'school', 'time', 'range', 'components', 'duration', 'concentration', 'ritual', 'attack', 'save', 'damage'],
  items: ['type', 'category', 'kind', 'damage', 'dtype', 'props', 'versatile', 'range', 'mastery', 'armorType', 'ac', 'strReq', 'stealthDis', 'rarity', 'attunement'],
  species: ['size', 'speed', 'darkvision', 'hpPerLevel', 'traits', 'resist'],
  backgrounds: ['featId', 'featList'],
  feats: ['name', 'category', 'prereq', 'plusOne', 'skillCount', 'initiativeProf'],
  subclasses: ['classId', 'features'],
  monsters: ['name', 'size', 'kind', 'alignment', 'scores', 'ac', 'speed', 'hp', 'hitDice', 'cr', 'xp', 'senses', 'languages', 'resist', 'immune', 'actions', 'traits', 'bonusActions', 'reactions', 'legendary'],
  classes: ['name', 'tagline', 'desc', 'hitDie', 'primary', 'saves', 'armor', 'weapons', 'tools', 'skillCount', 'skillFrom', 'masteries', 'casterType', 'casterAbility', 'casterList', 'cantrips1', 'subclassLevel', 'subclassTitle', 'asiLevels', 'features', 'resources', 'kit', 'kitGp', 'goldB'],
};
/** Required fields still empty, per step. */
const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
export function missingIn(step, fields, d) {
  const keys = step.keys || step.covers || [];
  return fields.filter((f) => f.req && keys.includes(f.k) && empty(d[f.k]));
}

/** Render the body of one plan step. */
export function renderStep(step, ctx) {
  const F = Object.fromEntries(ctx.fields.map((f) => [f.k, f]));
  const field = (f) => (f ? ctx.field(f) : null);
  const out = [];
  if (step.intro) out.push(h('p.muted', {}, step.intro));
  if (step.render) out.push(step.render({ ...ctx, F, field }));
  if (step.keys) out.push(...step.keys.map((k) => field(F[k])));
  return out.flat(3).filter(Boolean);
}

// ---------------------------------------------------------------- classes: flat editor values <-> class data
const FULL_PREP = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22];
const HALF_PREP = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15];
const THIRD_PREP = [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13];
const PACT_PREP = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
const cantripArr = (n) => (n ? Array.from({ length: 20 }, (_, i) => n + (i >= 3 ? 1 : 0) + (i >= 9 ? 1 : 0)) : null);
const resId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function classToDraft(e) {
  const c = e.caster;
  return {
    ...e, _raw: e,
    skillCount: e.skillChoices?.count ?? 2, skillFrom: e.skillChoices?.from || [],
    masteries: (e.choices || []).find((x) => x.type === 'weapon-mastery')?.count?.[0] || 0,
    casterType: c ? c.type : 'none', casterAbility: c?.ability || 'int', casterList: !c ? 'own' : (c.list === e.id ? 'own' : c.list), cantrips1: c?.cantrips ? (Array.isArray(c.cantrips) ? c.cantrips[0] : c.cantrips) : 0,
    subclassTitle: (e.features || []).find((f) => Number(f.level) === Number(e.subclassLevel || 3) && /subclass|choose/i.test(`${f.name} ${f.desc}`))?.name || e.subclassTitle || '',
    features: (e.features || []).filter((f) => !(Number(f.level) === Number(e.subclassLevel || 3) && /choose a subclass/i.test(f.desc || ''))).map((f) => ({ ...f })),
    resources: (e.resources || []).map((r) => ({ name: r.name, uses: Array.isArray(r.uses) ? r.uses.join(',') : String(r.uses ?? ''), reset: r.reset || 'long', note: r.note || '' })),
    kit: (e.equipment?.[0]?.items || []).map(([item, qty]) => ({ item, qty })), kitGp: e.equipment?.[0]?.gp ?? 10, goldB: e.equipment?.[1]?.gp ?? 100,
  };
}
export function draftToClass(d) {
  const raw = d._raw || {};
  const id = d.id;
  const caster = d.casterType && d.casterType !== 'none' ? {
    ...(raw.caster?.type === d.casterType ? raw.caster : {}),
    type: d.casterType, ability: d.casterAbility || 'int', list: !d.casterList || d.casterList === 'own' ? id : d.casterList,
    cantrips: cantripArr(Number(d.cantrips1) || 0),
    prepared: raw.caster?.type === d.casterType && raw.caster?.prepared ? raw.caster.prepared : { full: FULL_PREP, half: HALF_PREP, third: THIRD_PREP, pact: PACT_PREP }[d.casterType],
  } : null;
  const choices = (raw.choices || []).filter((x) => x.type !== 'weapon-mastery');
  const m = Number(d.masteries) || 0;
  if (m) choices.unshift({ id: 'masteries', level: 1, type: 'weapon-mastery', count: Array.from({ length: 20 }, (_, i) => m + (i >= 9 && m < 4 ? 1 : 0)), name: 'Weapon Mastery' });
  const subLv = Number(d.subclassLevel) || 3;
  const features = (d.features || []).filter((f) => String(f.name || '').trim()).map((f) => ({ ...f, level: Number(f.level) || 1 }));
  features.push({ level: subLv, name: d.subclassTitle?.trim() || `${d.name} Subclass`, desc: `Choose a subclass. You gain its features at level ${subLv} and later levels.` });
  features.sort((a, b) => a.level - b.level);
  const resources = (d.resources || []).filter((r) => String(r.name || '').trim()).map((r) => {
    const u = String(r.uses ?? '').trim();
    const uses = /^\d+(\s*,\s*\d+)+$/.test(u) ? Array.from({ length: 20 }, (_, i) => Number(u.split(',')[Math.min(i, u.split(',').length - 1)])) : /^\d+$/.test(u) ? Number(u) : u || 1;
    return { id: resId(r.name), name: r.name.trim(), reset: r.reset === 'short' ? 'short' : 'long', uses, ...(r.note ? { note: r.note } : {}) };
  });
  const out = {
    ...raw, id, name: d.name, tagline: d.tagline || '', desc: d.desc || '', hitDie: Number(d.hitDie) || 10, primary: d.primary?.length ? d.primary : ['str'],
    saves: d.saves || [], armor: d.armor || [], weapons: d.weapons || [], tools: d.tools || [],
    skillChoices: { count: Number(d.skillCount) || 2, from: d.skillFrom?.length ? d.skillFrom : SKILLS.map((s) => s.id) },
    caster, asiLevels: (d.asiLevels || [4, 8, 12, 16]).map(Number).sort((a, b) => a - b), subclassLevel: subLv, subclassTitle: d.subclassTitle || undefined,
    resources, choices, features, subclasses: raw.subclasses || [],
    equipment: [{ id: 'A', label: 'Gear', items: (d.kit || []).filter((r) => r.item).map((r) => [r.item, Number(r.qty) || 1]), gp: Number(d.kitGp) || 0 }, { id: 'B', label: 'Gold', items: [], gp: Number(d.goldB) || 100 }],
  };
  return out;
}
export const CLASS_FIELDS = () => [
  { k: 'name', label: 'Class name', type: 'text', req: true, hint: 'e.g. Gunslinger' },
  { k: 'tagline', label: 'One-line pitch', type: 'text', hint: 'Shown on the class card in the character builder' },
  { k: 'desc', label: 'Description', type: 'textarea' },
  { k: 'features', label: 'Feature details', type: 'rows', add: 'Add feature', fields: [{ k: 'level', label: 'Level', type: 'number', width: '5em', def: 1 }, { k: 'name', label: 'Name', type: 'text' }, { k: 'desc', label: 'Description', type: 'textarea' }] },
  { k: 'resources', label: 'Resources', type: 'rows', add: 'Add resource', fields: [{ k: 'name', label: 'Name (e.g. Rage)', type: 'text' }, { k: 'uses', label: 'Uses (2, pb, level, cha, or 2,2,3,3…)', type: 'text', width: '16em' }, { k: 'reset', label: 'long or short', type: 'text', width: '8em', def: 'long' }] },
  { k: 'kit', label: 'Option A gear', type: 'rows', add: 'Add item', fields: [{ k: 'item', label: 'Item', type: 'item' }, { k: 'qty', label: 'Qty', type: 'number', def: 1, width: '5em' }] },
  { k: 'kitGp', label: 'Option A gold (GP)', type: 'number', def: 10 },
  { k: 'goldB', label: 'Option B gold (GP)', type: 'number', def: 100 },
];
export const NEW_CLASS = { hitDie: 10, primary: ['str'], saves: ['str', 'con'], armor: ['light', 'medium', 'shield'], weapons: ['simple', 'martial'], tools: [], skillCount: 2, skillFrom: ['athletics', 'intimidation', 'perception', 'survival'], masteries: 2, casterType: 'none', casterAbility: 'int', casterList: 'own', cantrips1: 0, subclassLevel: 3, asiLevels: [4, 8, 12, 16], features: [], resources: [], kit: [], kitGp: 10, goldB: 100 };

/** A short sentence per type for the Start step. */
export const START_TEXT = {
  spells: 'Make a spell in five short steps: level and school, how it’s cast, what it does, its text, and which classes get it.',
  items: 'Weapons, armor, shields, clothing, gear, tools or magic items. Pick a kind and fill in only what matters for it.',
  species: 'Size, speed, senses and traits. Quick-add buttons give you starter text for common traits.',
  backgrounds: 'Ability scores, an origin feat, two skills, a tool and starting gear.',
  feats: 'Choose the kind of feat, any automatic benefits, then describe it.',
  subclasses: 'Pick the class, name it, then add a feature at each level that class gets subclass features.',
  monsters: 'Stat block step by step: hit points and attack bonuses are worked out for you from the scores and CR.',
  classes: 'Hit die, proficiencies, spellcasting, features level by level, resources and gear. The result works in the character builder like any other class.',
};
export { getFeat, rich };
