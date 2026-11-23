// Character builder. Flow: Settings · 1 Class · 2 Background · 3 Species · 4 Abilities · 5 Equipment · What's Next.
// Each step is a list → preview → confirm, then collapsible sections that hold every choice, with red
// badges counting the choices still to make (on the step tabs and on each section).
import { h, cap, explain, toast, modal, confirmDialog, portraitEl, copyText, rich } from './dom.js';
import { chips, counter, select, optionCards, featChoices, spellLine, spellListBox, abilityName, skillName } from './components.js';
import {
  ABILITIES, SKILLS, ALIGNMENTS, LANGUAGES, STANDARD_ARRAY, POINT_BUY_COST, WEAPON_MASTERIES,
  all, getFeat, getItem, getSpell, spellsFor, loadPacks, loadedBuiltinPacks,
} from '../data/index.js';
import { compute, featSlots, fmt, valueAt, levelForXp, XP_TABLE } from '../engine/rules.js';
import { roll } from '../engine/dice.js';
import { saveCharacter, exportCharacter } from '../engine/store.js';

export const STEPS = [
  { id: 'settings', label: 'Settings', short: 'Settings' },
  { id: 'class', label: '1. Class', short: 'Class' },
  { id: 'background', label: '2. Background', short: 'Background' },
  { id: 'species', label: '3. Species', short: 'Species' },
  { id: 'abilities', label: '4. Abilities', short: 'Abilities' },
  { id: 'equipment', label: '5. Equipment', short: 'Equipment' },
  { id: 'next', label: "What's Next", short: "What's Next" },
];
const ALIASES = { spells: 'class', details: 'background' };
const accState = {}; // remembers which sections are open between re-renders
const listState = {};
let itemQuery = { q: '', type: '' };

const CLASS_ICON = { barbarian: ['🪓', '#7d2f22'], bard: ['🎻', '#7a2f6a'], cleric: ['☀️', '#8a7424'], druid: ['🌿', '#3f6a2c'], fighter: ['⚔️', '#6b4a2c'], monk: ['👊', '#2c5a7a'],
  paladin: ['🛡️', '#8f6a1c'], ranger: ['🏹', '#2c6a4a'], rogue: ['🗡️', '#3c3c4c'], sorcerer: ['🔥', '#8f331f'], warlock: ['👁️', '#4c2c7a'], wizard: ['📖', '#1f4c8a'] };
const SPECIES_ICON = { dragonborn: '🐉', dwarf: '⛏️', elf: '🍃', gnome: '⚙️', goliath: '🏔️', halfling: '🍀', human: '🧭', orc: '🐗', tiefling: '😈' };
const LIFESTYLES = ['Wretched', 'Squalid', 'Poor', 'Modest', 'Comfortable', 'Wealthy', 'Aristocratic'];

// ---------------------------------------------------------------- helpers
const avail = (kind, c) => all(kind).filter((e) => !(c.settings.disabledPacks || []).includes(e.packId));
const sourceName = (e) => (e.source === 'SRD' || !e.source ? 'Core Rules (SRD 5.2)' : e.source);
const iconBox = (glyph, color, big) => h(`span.ico${big ? '.big' : ''}`, { style: { background: color } }, glyph);
const classIcon = (cls, big) => { const [g, col] = CLASS_ICON[cls.id] || [cls.name[0], '#5a4a3a']; return iconBox(g, col, big); };
const speciesIcon = (sp, big) => iconBox(SPECIES_ICON[sp.id] || sp.name[0], '#4a3c30', big);
const fact = (k, v) => h('div.fact', {}, h('span', {}, k), h('strong', {}, v));
const itemList = (opt) => (opt.note ? `${opt.note}${opt.gp ? ` (+${opt.gp} GP)` : ''} — listed items go to Other Possessions` : opt.items.length ? opt.items.map(([id, q]) => `${q > 1 ? `${q} ` : ''}${getItem(id)?.name || id}`).join(', ') + (opt.gp ? `, ${opt.gp} GP` : '') : `${opt.gp} GP`);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function acc(id, title, sub, body, { badge = 0, open = false } = {}) {
  const isOpen = accState[id] ?? open;
  return h('details.acc', { open: isOpen, ontoggle: (e) => { accState[id] = e.target.open; } },
    h('summary', {}, h('div.acc-text', {}, h('div.acc-title', {}, title), sub ? h('div.acc-sub', {}, sub) : null),
      badge ? h('span.badge', { title: `${plural(badge, 'choice')} to make` }, badge) : null, h('span.chev', {}, '⌄')),
    h('div.acc-body', {}, body));
}

function meetsReq(feat, d) {
  const any = feat.requires?.anyOf;
  return !any || Object.entries(any).some(([a, v]) => d.scores[a] >= v);
}

/** Number of unfinished sub-choices in a feat (spells, skills, ability picks). */
export function featTodo(feat, ch = {}, fixedList) {
  let n = 0;
  for (const def of feat?.choices || []) {
    if (def.type === 'spell-list' && !fixedList && !ch.list) n++;
    if (def.type === 'cantrip' && (ch.cantrips || []).length < def.count) n++;
    if (def.type === 'spell' && (ch.spell || []).length < def.count) n++;
    if ((def.type === 'ability' || def.type === 'ability-plus1') && !ch.ability) n++;
    if (def.type === 'skill' && (ch.skills || []).length < def.count) n++;
    if (def.type === 'asi' && ch.asi?.mode !== 'imported' && (!ch.asi?.a || (ch.asi.mode === 'double' && !ch.asi.b))) n++;
  }
  return n;
}

/** Every unfinished choice, grouped by builder step. Drives the red badges and the What's Next list. */
export function todos(c, d) {
  const t = { settings: [], class: [], background: [], species: [], abilities: [], equipment: [], next: [] };
  const cls = d.cls; const L = c.level;
  if (!cls) t.class.push('Choose a class');
  else {
    const n = cls.skillChoices.count - c.classSkills.length;
    if (n > 0) t.class.push(`Choose ${plural(n, 'skill proficiency')}`.replace('proficiencys', 'proficiencies'));
    for (const ch of cls.choices || []) {
      if (L < ch.level) continue;
      if ((ch.type === 'option' || ch.type === 'feat') && !c.classChoices[ch.id]) t.class.push(`Choose a ${ch.name}`);
      if (ch.type === 'weapon-mastery' && (c.classChoices.masteries || []).length < valueAt(ch.count, L)) t.class.push('Choose Weapon Mastery weapons');
      if (ch.type === 'expertise' && c.expertise.length < valueAt(ch.count, L)) t.class.push('Choose Expertise skills');
    }
    if (L >= cls.subclassLevel && !d.sub) t.class.push(`Choose a ${cls.name} subclass`);
    if (cls.id === 'fighter' && c.subclassId === 'champion' && L >= 7 && !c.classChoices['fighting-style-2']) t.class.push('Choose an Additional Fighting Style');
    for (const slot of featSlots(cls, L)) {
      const f = getFeat(c.levelFeats[slot.key]);
      if (!f) t.class.push(`Choose a feat for level ${slot.level}`);
      else if (featTodo(f, c.featChoices[slot.key])) t.class.push(`Finish the ${f.name} choices (level ${slot.level})`);
    }
    const sc = d.spellcasting;
    if (sc && c.spells.cantrips.length < sc.cantripsMax) t.class.push(`Choose ${sc.cantripsMax - c.spells.cantrips.length} more cantrip(s)`);
    if (sc && c.spells.prepared.length < sc.preparedMax) t.class.push(`Prepare ${sc.preparedMax - c.spells.prepared.length} more spell(s)`);
  }
  const bg = d.bg;
  if (!bg) t.background.push('Choose a background');
  else {
    const b = c.abilities.bgBonus || {};
    if (!b.mode || (b.mode === '2-1' && (!b.plus2 || !b.plus1)) || (b.mode === '1-1-1' && bg.anyAbilities && new Set((b.picks || []).filter(Boolean)).size < 3)) t.background.push('Assign the background ability score increases');
    const bf = getFeat(bg.feat.choose ? c.bgFeatId : bg.feat.id);
    if (bg.feat.choose && !bf) t.background.push('Choose an Origin feat');
    else if (featTodo(bf, c.featChoices.background, bg.feat.list)) t.background.push(`Finish the ${bf?.name} choices`);
  }
  const sp = d.species;
  if (!sp) t.species.push('Choose a species');
  else {
    for (const ch of sp.choices || []) {
      if (ch.type === 'origin-feat') {
        const f = getFeat(c.speciesChoices.versatile);
        if (!f) t.species.push('Choose an Origin feat (Versatile)');
        else if (featTodo(f, c.featChoices.versatile)) t.species.push(`Finish the ${f.name} choices`);
      } else if (!c.speciesChoices[ch.id]) t.species.push(`Choose ${ch.name}`);
    }
    if ((c.languages || []).length < 2) t.species.push('Choose two languages');
  }
  const A = c.abilities;
  if (!A.method) t.abilities.push('Choose a generation method');
  else if (A.method === 'standard' && Object.keys(A.assigned || {}).length < 6) t.abilities.push('Assign all six Standard Array scores');
  if (!c.equipment.applied) t.equipment.push('Add starting equipment or gold');
  return t;
}

// ---------------------------------------------------------------- shell
export function renderBuilder(root, c, step, go) {
  step = ALIASES[step] || step;
  if (!STEPS.find((s) => s.id === step)) step = 'class';
  const rerender = () => renderBuilder(root, c, step, go);
  const update = (fn) => { fn(c); saveCharacter(c); rerender(); };
  const d = compute(c);
  const todo = todos(c, d);
  const idx = STEPS.findIndex((s) => s.id === step);
  const prev = STEPS[idx - 1]; const next = STEPS[idx + 1];
  const ctx = { c, d, update, todo, go, rerender };
  const body = { settings: settingsStep, class: classStep, background: backgroundStep, species: speciesStep, abilities: abilitiesStep, equipment: equipmentStep, next: nextStep }[step](ctx);
  const href = (s) => `#build-${c.id}-${s.id}`;

  const scrollY = window.scrollY;
  root.replaceChildren(
    h('div.builder-bar', {},
      h('div.bb-title', {}, h('div.bb-name', {}, 'Character Builder'), h('div.bb-sub', {}, portraitEl(c, 'mini'), h('span.bb-charname', {}, c.name || 'Unnamed character'))),
      h('nav.bb-steps', {}, STEPS.map((s) => {
        const n = todo[s.id].length;
        return h(`a.bb-step${s.id === step ? '.on' : ''}`, { href: href(s), title: todo[s.id].join('\n') }, s.id === 'settings' ? '⚙ ' : '', s.label, n ? h('span.badge', {}, n) : null);
      })),
      h('a.bb-sheet', { href: `#sheet-${c.id}`, title: 'Open character sheet' }, '📜')),
    h('div.builder', {},
      identity(ctx, prev && href(prev), next && href(next)),
      h('section.step-body', {}, body),
      h('div.step-nav', {},
        prev ? h('a.btn', { href: href(prev) }, `‹ ${prev.short}`) : h('span'),
        next ? h('a.btn.primary', { href: href(next) }, `${next.short} ›`) : h('a.btn.primary', { href: `#sheet-${c.id}` }, 'View Character Sheet ›'))));
  window.scrollTo(0, scrollY);
}

// ---------------------------------------------------------------- name & portrait
const SYL = {
  default: [['Al', 'Bel', 'Cor', 'Da', 'El', 'Fen', 'Gar', 'Hal', 'Is', 'Jor', 'Ka', 'Lor', 'Mar', 'Ny', 'Or', 'Per', 'Ro', 'Syl', 'Tam', 'Ul', 'Vor', 'Wyn', 'Zan'], ['a', 'an', 'ard', 'ia', 'ion', 'is', 'or', 'eth', 'wyn', 'ric', 'sa', 'os', 'ena', 'ius']],
  dragonborn: [['Kra', 'Vor', 'Thar', 'Rhaz', 'Dra', 'Sko', 'Zar', 'Bha', 'Ix', 'Qel'], ['jax', 'dor', 'ess', 'ith', 'ush', 'arr', 'ion', 'esh', 'ara', 'yx']],
  dwarf: [['Bram', 'Dur', 'Thor', 'Gund', 'Bal', 'Kar', 'Mor', 'Brun', 'Hil', 'Ves'], ['ik', 'in', 'grim', 'dak', 'rum', 'da', 'ra', 'dis', 'ga', 'mund']],
  elf: [['Ae', 'Cael', 'Ela', 'Fae', 'Ili', 'Lia', 'Myr', 'Sae', 'Thal', 'Ys'], ['driel', 'ndra', 'wyn', 'lith', 'rion', 'thas', 'vyre', 'nae', 'ssa', 'ril']],
  gnome: [['Bim', 'Fizz', 'Nim', 'Pip', 'Quill', 'Tink', 'Wob', 'Zook', 'Dab', 'Fen'], ['ble', 'wick', 'nock', 'pin', 'ster', 'bin', 'dle', 'sy', 'kin', 'nib']],
  goliath: [['Ka', 'Tho', 'Gae', 'Ilu', 'Mau', 'Vau', 'Ora', 'Pa', 'Ke', 'Lo'], ['lag', 'thak', 'vak', 'nu', 'rik', 'gar', 'neth', 'kal']],
  halfling: [['Ros', 'Mil', 'Per', 'Cob', 'Lid', 'Wil', 'Tom', 'Bel', 'Fen', 'Mer'], ['ie', 'o', 'rin', 'by', 'da', 'ry', 'wick', 'sy', 'ton', 'la']],
  orc: [['Gro', 'Kar', 'Ush', 'Mog', 'Thok', 'Brag', 'Vol', 'Rak', 'Zug', 'Hra'], ['nak', 'gar', 'ka', 'ush', 'dar', 'mok', 'ra', 'gul', 'tash']],
  tiefling: [['Ze', 'Mal', 'Kai', 'Vex', 'Nem', 'Ori', 'Lyr', 'Bel', 'Sar', 'Ash'], ['ira', 'eth', 'ax', 'os', 'ith', 'ael', 'ys', 'oria', 'ek', 'iel']],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const nameIdeas = (speciesId) => { const [a, b] = SYL[speciesId] || SYL.default; return Array.from({ length: 6 }, () => pick(a) + pick(b)); };

async function pickPortrait(update) {
  const input = h('input', { type: 'file', accept: 'image/*' });
  input.addEventListener('change', async () => {
    const f = input.files[0]; if (!f) return;
    try {
      const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
      const s = 240; const cv = document.createElement('canvas'); cv.width = cv.height = s;
      const m = Math.min(img.width, img.height);
      cv.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      update((x) => { x.portrait = cv.toDataURL('image/jpeg', 0.85); });
    } catch { toast('Could not read that image'); }
  });
  input.click();
}

function identity({ c, update }, prevHref, nextHref) {
  const sugg = h('div.suggestions');
  const setName = (n) => { c.name = n; saveCharacter(c); nameInput.value = n; const s = document.querySelector('.bb-charname'); if (s) s.textContent = n || 'Unnamed character'; };
  const nameInput = h('input.name-field', { value: c.name, placeholder: 'Character name', oninput: (e) => setName(e.target.value) });
  const showSugg = () => sugg.replaceChildren(...nameIdeas(c.speciesId).map((n) => h('button.chip', { type: 'button', onclick: () => setName(n) }, n)), h('button.chip.ghost', { type: 'button', onclick: showSugg }, '↻ More'));
  return h('div.identity', {},
    prevHref ? h('a.arrow', { href: prevHref, 'aria-label': 'Previous step' }, '‹') : h('span.arrow.ghost'),
    h('div.id-portrait', {},
      h('button.portrait-pick', { type: 'button', title: 'Upload a portrait', onclick: () => pickPortrait(update) }, portraitEl(c, 'portrait big'), h('span.pp-plus', {}, '+')),
      c.portrait ? h('button.linkish.tiny', { type: 'button', onclick: () => update((x) => { x.portrait = null; }) }, 'Remove') : null),
    h('div.id-main', {}, h('label', {}, 'Character Name'), nameInput, h('button.linkish', { type: 'button', onclick: showSugg }, 'Show suggestions'), sugg),
    nextHref ? h('a.arrow', { href: nextHref, 'aria-label': 'Next step' }, '›') : h('span.arrow.ghost'));
}

// ---------------------------------------------------------------- source-grouped list (classes, species)
function sourceList(kind, items, { icon, meta, onPick, placeholder }) {
  const groups = [];
  for (const it of items) {
    const id = it.packId || 'srd-5.2';
    let g = groups.find((x) => x.id === id);
    const bp = loadedBuiltinPacks().find((p) => p.id === id);
    if (!g) groups.push(g = { id, label: id === 'srd-5.2' ? 'Core Rules (2024)' : bp ? bp.name : it.source,
      desc: id === 'srd-5.2' ? 'Character options from the System Reference Document 5.2 (CC-BY-4.0).' : bp ? `${bp.description} (${bp.license})` : 'Your homebrew content.', items: [] });
    g.items.push(it);
  }
  const list = h('div.src-groups', {}, groups.map((g) => h('details.src-group', { open: listState[`${kind}:${g.id}`] ?? true, ontoggle: (e) => { listState[`${kind}:${g.id}`] = e.target.open; } },
    h('summary', {}, h('div', {}, h('div.sg-title', {}, g.label), h('div.sg-desc', {}, g.desc)), h('span.chev', {}, '⌄')),
    h('div.rows', {}, g.items.map((it) => h('button.list-row', { type: 'button', 'data-name': it.name.toLowerCase(), onclick: () => onPick(it) },
      icon(it), h('div.lr-text', {}, h('div.lr-name', {}, it.name), h('div.lr-sub', {}, meta(it))), h('span.lr-chev', {}, '›')))))));
  const search = h('input.search', { type: 'search', placeholder, oninput: (e) => {
    const q = e.target.value.toLowerCase();
    list.querySelectorAll('.list-row').forEach((r) => { r.style.display = r.dataset.name.includes(q) ? '' : 'none'; });
  } });
  return [search, h('div.expand-links', {},
    h('button.linkish', { type: 'button', onclick: () => list.querySelectorAll('details').forEach((x) => { x.open = false; }) }, 'Collapse all'),
    h('button.linkish', { type: 'button', onclick: () => list.querySelectorAll('details').forEach((x) => { x.open = true; }) }, 'Expand all')), list];
}

// ---------------------------------------------------------------- SETTINGS
function settingsStep({ c, update }) {
  const s = c.settings;
  const packs = [...loadedBuiltinPacks().map((p) => ({ ...p, builtin: true })), ...loadPacks()];
  const row = (label, desc, control) => h('div.setting', {}, h('div', {}, h('b', {}, label), desc ? h('div.muted.tiny', {}, desc) : null), control);
  const toggle = (checked, fn, disabled) => h('input.switch', { type: 'checkbox', checked, disabled, onchange: (e) => update((x) => fn(x, e.target.checked)) });
  const sel = (val, opts, fn) => h('select', { onchange: (e) => update((x) => fn(x, e.target.value)) }, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
  return [
    h('h2', {}, 'Character Settings'), h('p.muted', {}, 'These settings apply to this character only.'),
    acc('set-src', 'Sources', 'Which content this character can use', [
      row('Core Rules (SRD 5.2)', 'The 2024 System Reference Document. Always on.', toggle(true, () => {}, true)),
      packs.length ? packs.map((p) => row(p.name, p.builtin ? `${p.license} · ${p.description}` : p.enabled === false ? 'Turned off for all characters on the Homebrew page.' : `Homebrew pack${p.author ? ` by ${p.author}` : ''}`,
        toggle(p.enabled !== false && !s.disabledPacks.includes(p.id), (x, on) => { x.settings.disabledPacks = on ? x.settings.disabledPacks.filter((id) => id !== p.id) : [...x.settings.disabledPacks, p.id]; }, p.enabled === false)))
        : h('p.muted.tiny', {}, 'No homebrew packs installed yet.'),
      h('a.linkish', { href: '#homebrew' }, 'Turn content packs on or off for all characters ›'),
    ], { open: true }),
    acc('set-adv', 'Character Advancement', 'Leveling and Hit Points', [
      row('Advancement Type', 'Milestone: your DM tells you when you level up. XP: track experience points and level automatically.',
        sel(s.advancement, [['milestone', 'Milestone'], ['xp', 'Experience Points (XP)']], (x, v) => { x.settings.advancement = v; if (v === 'xp') x.xp = Math.max(x.xp || 0, XP_TABLE[x.level - 1]); })),
      row('Hit Point Type', 'Fixed: take the average for each level after 1st. Manual: roll your Hit Die (or type the roll) per level.',
        sel(s.hpType, [['fixed', 'Fixed'], ['manual', 'Manual (rolled)']], (x, v) => { x.settings.hpType = v; })),
      row('Use Prerequisites', 'Only offer feats whose prerequisites you meet.', toggle(s.usePrereqs !== false, (x, v) => { x.settings.usePrereqs = v; })),
    ], { open: true }),
    extrasPanel(c, update),
    acc('set-disp', 'Sheet Display', 'How the character sheet looks', [
      row('Ability Score Display', 'Which number is shown large on the sheet.', sel(s.abilityDisplay, [['modifiers', 'Modifiers on top'], ['scores', 'Scores on top']], (x, v) => { x.settings.abilityDisplay = v; })),
      row('Encumbrance', 'Standard: show carrying capacity (STR × 15 lb).', sel(s.encumbrance, [['standard', 'Standard'], ['none', 'No encumbrance']], (x, v) => { x.settings.encumbrance = v; })),
      row('Ignore Coin Weight', 'Otherwise every 50 coins weigh 1 lb.', toggle(s.ignoreCoinWeight !== false, (x, v) => { x.settings.ignoreCoinWeight = v; })),
    ], { open: true }),
  ];
}

/** Proficiencies, feats and spells that came from an import rather than a builder choice. Each can be removed. */
function extrasPanel(c, update) {
  const ex = c.extras || {};
  const label = { skills: (id) => SKILLS.find((s) => s.id === id)?.name || id, tools: (t) => t, armor: (a) => `${cap(a)} armor`, weapons: (w) => `${cap(w)} weapons`,
    feats: (f) => getFeat(f.featId)?.name || f.featId, spells: (x) => `${getSpell(x.spellId)?.name || x.spellId} (${x.source})` };
  const groups = { skills: 'Skill proficiencies', tools: 'Tool proficiencies', armor: 'Armor training', weapons: 'Weapon proficiencies', feats: 'Feats', spells: 'Spells' };
  const rows = Object.entries(groups).filter(([k]) => (ex[k] || []).length);
  if (!rows.length) return null;
  return acc('set-extras', 'Other Proficiencies, Feats & Spells', 'From an import, not from a builder choice', [
    h('p.muted.tiny', {}, 'These were on the imported sheet but don\'t come from a choice in this builder. Remove any you don\'t want.'),
    rows.map(([k, title]) => h('div.setting', {}, h('div', {}, h('b', {}, title)),
      h('div.chips', {}, ex[k].map((v, i) => h('span.chip', {}, label[k](v), ' ', h('button.chip-x', { type: 'button', title: 'Remove', onclick: () => update((x) => {
        x.extras[k] = x.extras[k].filter((_, j) => j !== i);
        if (k === 'feats') { // keep each remaining feat's choices attached to its new position
          const old = { ...x.featChoices }; ex.feats.forEach((_, j) => delete x.featChoices[`extra-${j}`]);
          let n = 0; ex.feats.forEach((_, j) => { if (j !== i) x.featChoices[`extra-${n++}`] = old[`extra-${j}`] || {}; });
        }
      }) }, '×')))))),
  ], { open: true });
}

// ---------------------------------------------------------------- CLASS
function classPreview(cls, onAdd) {
  modal(cls.name, h('div.preview', {},
    h('div.pv-head', {}, classIcon(cls, true), h('div', {}, h('p.lead', {}, cls.tagline), h('p', {}, cls.desc))),
    h('div.facts', {}, fact('Hit Die', `d${cls.hitDie}`), fact('Primary Ability', cls.primary.map(abilityName).join(' or ')), fact('Saves', cls.saves.map(abilityName).join(', ')),
      fact('Armor', cls.armor.length ? cls.armor.map(cap).join(', ') : 'None'), cls.caster ? fact('Spellcasting', abilityName(cls.caster.ability)) : null),
    h('h4', {}, 'Class Features'),
    h('div.feature-list', {}, cls.features.map((f) => h('details.feature', {}, h('summary', {}, h('span.lv', {}, `Lv ${f.level}`), f.name), rich(f.text || f.desc)))),
    h('h4', {}, 'Subclasses'), h('ul.compact', {}, (cls.subclasses || []).map((s) => h('li', {}, h('b', {}, s.name), ' — ', s.desc, s.source && s.source !== 'SRD' ? h('em.src', {}, s.source) : null)))),
  [{ label: 'Cancel' }, { label: `Add ${cls.name}`, primary: true, onClick: onAdd }]);
}

function classStep(ctx) {
  const { c, d, update } = ctx;
  const cls = d.cls; const L = c.level;
  if (!cls) {
    return [h('h2', {}, 'Choose a Class'),
      ...sourceList('classes', avail('classes', c), { placeholder: 'Search classes…', icon: (it) => classIcon(it), meta: (it) => sourceName(it),
        onPick: (it) => classPreview(it, () => update((x) => {
          Object.assign(x, { classId: it.id, subclassId: null, classSkills: [], classChoices: {}, expertise: [], levelFeats: {}, spells: { cantrips: [], prepared: [] } });
          x.equipment.classOption = null; x.equipment.applied = false;
        })) })];
  }
  const xpMode = c.settings.advancement === 'xp';
  const levelCtl = xpMode
    ? h('div.lvl', {}, h('label', {}, 'XP'), h('input.num', { type: 'number', min: 0, value: c.xp || 0, onchange: (e) => update((x) => { x.xp = Math.max(0, Number(e.target.value) || 0); x.level = levelForXp(x.xp); }) }),
      h('span.muted.tiny', {}, `Level ${L}${L < 20 ? ` · next at ${XP_TABLE[L].toLocaleString()} XP` : ''}`))
    : h('div.lvl', {}, h('label', {}, 'Level'), h('select', { onchange: (e) => update((x) => { x.level = Number(e.target.value); }) }, Array.from({ length: 20 }, (_, i) => h('option', { value: i + 1, selected: L === i + 1 }, i + 1))));

  const hd = cls.hitDie;
  const manual = c.settings.hpType === 'manual';
  const hpBody = [
    h('p', {}, `Hit Die: d${hd} per ${cls.name} level. Level 1: ${hd} + CON modifier. Each later level: ${manual ? `roll 1d${hd}` : `${hd / 2 + 1} (fixed)`} + CON modifier. Change this in Settings.`),
    h('p', {}, h('b', {}, `Max HP: ${d.hpMax}`), h('span.muted', {}, ` (CON modifier ${fmt(d.mods.con)})`)),
    manual && L > 1 ? h('div.hp-rolls', {}, Array.from({ length: L - 1 }, (_, i) => {
      const lv = i + 2;
      return h('div.hp-roll', {}, h('span', {}, `Level ${lv}`),
        h('input.num', { type: 'number', min: 1, max: hd, value: c.hpRolls?.[lv] ?? '', placeholder: hd / 2 + 1, onchange: (e) => update((x) => { const v = Number(e.target.value); x.hpRolls = { ...x.hpRolls, [lv]: v > 0 ? Math.min(hd, v) : undefined }; }) }),
        h('button.icon-btn', { type: 'button', title: `Roll 1d${hd}`, onclick: () => update((x) => { x.hpRolls = { ...x.hpRolls, [lv]: roll(`1d${hd}`).total }; }) }, '🎲'));
    })) : null,
  ];

  const skillPool = cls.skillChoices.from === 'any' ? SKILLS.map((s) => s.id) : cls.skillChoices.from;
  const bgSkills = d.bg?.skills || [];
  const skillsLeft = Math.max(0, cls.skillChoices.count - c.classSkills.length);
  const profBody = [
    h('div.facts', {}, fact('Saving Throws', cls.saves.map(abilityName).join(', ')), fact('Armor', d.proficiencies.armor.map(cap).join(', ') || 'None'),
      fact('Weapons', d.proficiencies.weapons.map((w) => cap(w.replace(/-/g, ' '))).join(', ')), cls.tools.length ? fact('Tools', cls.tools.join(', ')) : null),
    h('p', {}, h('b', {}, `Skills: choose ${cls.skillChoices.count} `), counter(c.classSkills.length, cls.skillChoices.count)),
    h('p.muted.tiny', {}, `Proficiency adds your Proficiency Bonus (${fmt(d.pb)}) to checks with that skill. Skills your background already gives are greyed out.`),
    chips({ options: skillPool.map((id) => ({ id, label: skillName(id) })), selected: c.classSkills, max: cls.skillChoices.count,
      locked: bgSkills.filter((s) => skillPool.includes(s) && !c.classSkills.includes(s)), onChange: (v) => update((x) => { x.classSkills = v; }) }),
  ];

  // Build the ordered feature list, attaching each choice to the feature that grants it.
  const NAME_TO_CHOICE = { 'Fighting Style': 'fighting-style', 'Weapon Mastery': 'masteries', Expertise: 'expertise', 'Deft Explorer': 'expertise', 'Divine Order': 'divine-order', 'Primal Order': 'primal-order' };
  const choiceById = Object.fromEntries((cls.choices || []).map((ch) => [ch.id, ch]));
  const used = new Set();
  const entries = [];
  for (const f of cls.features) {
    if (f.level > L || f.name === `${cls.name} Subclass`) continue;
    let ui = null; let badge = 0;
    const chId = NAME_TO_CHOICE[f.name];
    if (chId && choiceById[chId] && !used.has(chId) && L >= choiceById[chId].level) { used.add(chId); [ui, badge] = classChoiceUI(ctx, choiceById[chId]); }
    if ((f.name === 'Spellcasting' || f.name === 'Pact Magic') && d.spellcasting) [ui, badge] = spellsUI(ctx);
    entries.push({ ...f, source: cls.name, ui, badge });
  }
  if (L >= cls.subclassLevel) {
    const subs = (cls.subclasses || []).filter((s) => !c.settings.disabledPacks.includes(s.packId));
    entries.push({ level: cls.subclassLevel, name: `${cls.name} Subclass`, desc: `Choose the specialization that shapes the rest of your ${cls.name} career. Homebrew subclasses from your enabled packs appear here too.`,
      source: d.sub ? d.sub.name : cls.name, ui: optionCards({ options: subs.map((x) => ({ ...x, source: x.source && x.source !== 'SRD' ? `${x.source}${x.edition === '2014' ? ' · 2014 rules' : ''}` : x.source })), value: c.subclassId, onChange: (v) => update((x) => { x.subclassId = v; }) }), badge: d.sub ? 0 : 1 });
  }
  for (const f of d.sub?.features || []) {
    if (f.level > L) continue;
    let ui = null; let badge = 0;
    if (f.name === 'Additional Fighting Style') {
      ui = featSlotUI(ctx, 'fighting-style-2', ['fighting-style'], c.classChoices['fighting-style-2'], (x, v) => { x.classChoices['fighting-style-2'] = v; });
      badge = c.classChoices['fighting-style-2'] ? 0 : 1;
    }
    entries.push({ ...f, source: d.sub.name, ui, badge });
  }
  for (const slot of featSlots(cls, L)) {
    const epic = slot.kind === 'epic-boon';
    const featId = c.levelFeats[slot.key];
    entries.push({ level: slot.level, name: epic ? 'Epic Boon' : 'Ability Score Improvement', source: cls.name,
      desc: epic ? 'Gain an Epic Boon feat or another feat you qualify for.' : 'Take the Ability Score Improvement feat to raise your scores, or choose another feat you qualify for.',
      ui: featSlotUI(ctx, slot.key, epic ? ['epic-boon', 'general'] : ['general', 'origin'], featId, (x, v) => { x.levelFeats[slot.key] = v; x.featChoices[slot.key] = {}; }),
      badge: featId ? featTodo(getFeat(featId), c.featChoices[slot.key]) : 1 });
  }
  entries.sort((a, b) => a.level - b.level);

  return [
    h('div.class-card', {}, classIcon(cls, true),
      h('div.cc-text', {}, h('h2', {}, cls.name), h('div.muted', {}, d.sub ? d.sub.name : sourceName(cls))),
      levelCtl,
      h('button.btn.small', { onclick: () => confirmDialog('Change class?', 'Your class choices (skills, features, subclass, spells and feats) will be cleared.', () => update((x) => { x.classId = null; }), 'Change Class') }, 'Change Class')),
    acc('cls-hp', 'Hit Points', `d${hd} Hit Die · ${d.hpMax} HP`, hpBody),
    acc('cls-prof', 'Proficiencies', `${plural(cls.skillChoices.count, 'skill')} to choose`, profBody, { badge: skillsLeft ? 1 : 0, open: skillsLeft > 0 }),
    h('h3.section', {}, 'Class Features'),
    entries.map((e) => acc(`cf-${c.classId}-${e.level}-${e.name}`, e.name, `Level ${e.level}${e.source !== cls.name ? ` · ${e.source}` : ''}`,
      [ruleText(e), e.ui], { badge: e.badge, open: e.badge > 0 })),
    L < 20 ? h('p.muted.center.tiny', {}, 'Raise your level to unlock more features.') : null,
  ];
}

/** Feature rules text; long text that sits above choices is folded so the choices stay in view. */
function ruleText(e) {
  if (!e.text) return /\n/.test(e.desc || '') ? rich(e.desc, 'rich feature-desc') : h('p.feature-desc', {}, e.desc);
  if (e.ui && e.text.length > 500) return h('details.rules-fold', {}, h('summary', {}, h('span', {}, e.desc), h('span.linkish', {}, ' Read full rules')), rich(e.text, 'rich feature-desc'));
  return rich(e.text, 'rich feature-desc');
}

function classChoiceUI({ c, d, update, ...ctx }, ch) {
  const L = c.level;
  if (ch.type === 'option') return [optionCards({ options: ch.options, value: c.classChoices[ch.id], onChange: (v) => update((x) => { x.classChoices[ch.id] = v; }) }), c.classChoices[ch.id] ? 0 : 1];
  if (ch.type === 'feat') return [featSlotUI({ c, d, update, ...ctx }, ch.id, [ch.category], c.classChoices[ch.id], (x, v) => { x.classChoices[ch.id] = v; }), c.classChoices[ch.id] ? 0 : 1];
  if (ch.type === 'weapon-mastery') {
    const n = valueAt(ch.count, L); const sel = c.classChoices.masteries || [];
    const martial = d.proficiencies.weapons.includes('martial');
    const weapons = all('items').filter((i) => i.type === 'weapon' && (i.category === 'simple' || martial
      || (d.proficiencies.weapons.includes('martial-finesse-light') && (i.props.includes('Finesse') || i.props.includes('Light')))
      || (d.proficiencies.weapons.includes('martial-light') && i.props.includes('Light'))));
    return [h('div', {}, h('p', {}, 'Choose ', counter(sel.length, n)),
      explain('What do the mastery properties do?', h('ul.compact', {}, Object.entries(WEAPON_MASTERIES).map(([k, v]) => h('li', {}, h('b', {}, k), ': ', v)))),
      chips({ options: weapons.map((w) => ({ id: w.id, label: `${w.name} (${w.mastery})` })), selected: sel, max: n, onChange: (v) => update((x) => { x.classChoices.masteries = v; }) })), sel.length < n ? 1 : 0];
  }
  if (ch.type === 'expertise') {
    const n = valueAt(ch.count, L);
    const prof = SKILLS.filter((s) => d.skills[s.id].prof).map((s) => ({ id: s.id, label: s.name }));
    return [h('div', {}, h('p', {}, 'Choose ', counter(c.expertise.length, n), h('span.muted.tiny', {}, ' — doubles your Proficiency Bonus for a skill you are proficient in.')),
      prof.length ? chips({ options: prof, selected: c.expertise, max: n, onChange: (v) => update((x) => { x.expertise = v; }) }) : h('p.muted', {}, 'Choose skill proficiencies first.')), c.expertise.length < n ? 1 : 0];
  }
  return [null, 0];
}

function featSlotUI({ c, d, update }, key, cats, value, setFn) {
  const usePrereq = c.settings.usePrereqs !== false;
  const feat = getFeat(value);
  return h('div.feat-slot', {},
    h('select', { onchange: (e) => update((x) => setFn(x, e.target.value || null)) }, h('option', { value: '' }, '— Choose a Feat —'),
      cats.map((cat) => h('optgroup', { label: cap(cat.replace('-', ' ')) }, avail('feats', c).filter((f) => f.category === cat).map((f) => {
        const ok = !usePrereq || meetsReq(f, d);
        return h('option', { value: f.id, selected: f.id === value, disabled: !ok && f.id !== value }, f.name + (ok ? '' : ' (prerequisite not met)') + (f.source !== 'SRD' ? ` · ${f.source}` : ''));
      })))),
    feat ? h('div.feat-desc', {}, feat.prereq ? h('em', {}, `Prerequisite: ${feat.prereq}.`) : null, rich(feat.text || feat.desc)) : null,
    feat ? featChoices(feat, c.featChoices[key] || {}, (p) => update((x) => { x.featChoices[key] = { ...(x.featChoices[key] || {}), ...p }; })) : null);
}

function spellsUI({ c, d, update }) {
  const sc = d.spellcasting;
  const toggle = (kind, id, max) => update((x) => {
    const set = new Set(x.spells[kind]);
    if (set.has(id)) set.delete(id); else if (set.size < max) set.add(id); else { toast(`You can only have ${max}.`); return; }
    x.spells[kind] = [...set];
  });
  const box = (on, fn) => h('label.pick', { onclick: (e) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: on, onchange: fn }));
  const cantrips = spellsFor(sc.list, 0).filter((s) => s.level === 0);
  const listNames = [sc.list].flat().map(cap).join(' and ');
  const leveled = spellsFor(sc.list, sc.maxSpellLevel).filter((s) => s.level > 0);
  const badge = (c.spells.cantrips.length < sc.cantripsMax ? 1 : 0) + (c.spells.prepared.length < sc.preparedMax ? 1 : 0);
  return [h('div', {},
    h('div.facts', {}, fact('Ability', abilityName(sc.ability)), fact('Save DC', sc.dc), fact('Spell Attack', fmt(sc.attack)),
      fact('Slots', sc.pact ? `${sc.pact.count} × level ${sc.pact.level}` : sc.slots.map((n, i) => `${n}×L${i + 1}`).join(' '))),
    sc.cantripsMax ? [h('h4', {}, 'Cantrips ', counter(c.spells.cantrips.length, sc.cantripsMax)),
      spellListBox(cantrips.map((sp) => spellLine(sp, box(c.spells.cantrips.includes(sp.id), () => toggle('cantrips', sp.id, sc.cantripsMax)))), cantrips)] : null,
    h('h4', {}, 'Prepared Spells ', counter(c.spells.prepared.length, sc.preparedMax)),
    h('p.muted.tiny', {}, `Spells of level ${sc.maxSpellLevel === 1 ? '1' : `1–${sc.maxSpellLevel}`} from the ${listNames} list${[sc.list].flat().length > 1 ? 's' : ''}, including spells from your enabled content packs.`),
    spellListBox(leveled.map((sp) => spellLine(sp, box(c.spells.prepared.includes(sp.id), () => toggle('prepared', sp.id, sc.preparedMax)))), leveled),
    d.grantedSpells.length ? [h('h4', {}, 'Always Prepared'), h('div.spell-pick', {}, d.grantedSpells.map((g) => { const sp = d.spellDetail(g.spellId); return sp ? spellLine(sp, h('em.src', {}, g.source)) : null; }))] : null), badge];
}

// ---------------------------------------------------------------- BACKGROUND
function backgroundStep(ctx) {
  const { c, d, update } = ctx;
  const bg = d.bg;
  const bgs = avail('backgrounds', c);
  const out = [
    h('h2', {}, 'Choose Origin: Background'),
    h('p.muted', {}, 'Your background is what you did before adventuring. It gives your ability score increases, an Origin feat, two skills, a tool proficiency and starting gear. Add more backgrounds with homebrew packs in Settings → Sources.'),
    h('select.big-select', { onchange: (e) => update((x) => { x.backgroundId = e.target.value || null; x.abilities.bgBonus = x.abilities.bgBonus?.mode === 'imported' ? { mode: 'imported' } : {}; x.featChoices.background = {}; x.equipment.bgOption = null; x.equipment.applied = false; }) },
      h('option', { value: '' }, '— Choose an Option —'), bgs.map((b) => h('option', { value: b.id, selected: b.id === c.backgroundId }, b.name + (b.source !== 'SRD' ? ` (${b.source})` : '')))),
  ];
  if (bg) {
    const b = c.abilities.bgBonus || {};
    const abil = bg.abilities.map((a) => ({ id: a, label: abilityName(a) }));
    const picks = b.picks || [];
    const asiBadge = !b.mode || (b.mode === '2-1' && (!b.plus2 || !b.plus1)) || (b.mode === '1-1-1' && bg.anyAbilities && new Set(picks.filter(Boolean)).size < 3) ? 1 : 0;
    const feat = getFeat(bg.feat.choose ? c.bgFeatId : bg.feat.id);
    const featBadge = bg.feat.choose && !feat ? 1 : featTodo(feat, c.featChoices.background, bg.feat.list);
    out.push(h('div.bg-card', {},
      bg.text && bg.text.length > 700
        ? [h('p', {}, bg.desc), h('details.rules-fold', {}, h('summary', {}, h('span.linkish', {}, 'Read the full background')), rich(bg.text))]
        : rich(bg.text || bg.desc),
      acc('bg-asi', 'Ability Scores', bg.abilities.map(abilityName).join(', '), [
        b.mode === 'imported' ? h('p.notice', {}, 'Imported character: your ability scores already include these increases, so nothing is added. If you want to set them here, lower your base scores on the Abilities step first, then pick +2 / +1 or +1 / +1 / +1.') : null,
        h('p.muted', {}, bg.anyAbilities ? 'This background comes from an older book, so choose any abilities: +2 to one and +1 to another, or +1 to three. No score can go above 20.' : `Increase one of these by 2 and another by 1, or all three by 1. No score can go above 20.`),
        h('div.seg', {},
          h(`button${b.mode === '2-1' ? '.on' : ''}`, { type: 'button', onclick: () => update((x) => { x.abilities.bgBonus = { mode: '2-1' }; }) }, '+2 / +1'),
          h(`button${b.mode === '1-1-1' ? '.on' : ''}`, { type: 'button', onclick: () => update((x) => { x.abilities.bgBonus = { mode: '1-1-1' }; }) }, '+1 / +1 / +1')),
        b.mode === '2-1' ? h('div.row', {},
          h('label', {}, '+2 ', select({ value: b.plus2, options: abil, onChange: (v) => update((x) => { x.abilities.bgBonus.plus2 = v; if (x.abilities.bgBonus.plus1 === v) x.abilities.bgBonus.plus1 = null; }) })),
          h('label', {}, '+1 ', select({ value: b.plus1, options: abil.filter((a) => a.id !== b.plus2), onChange: (v) => update((x) => { x.abilities.bgBonus.plus1 = v; }) }))) : null,
        b.mode === '1-1-1' && bg.anyAbilities ? h('div.row', {}, [0, 1, 2].map((i) => h('label', {}, '+1 ', select({ value: picks[i], options: abil.filter((a) => a.id === picks[i] || !picks.includes(a.id)),
          onChange: (v) => update((x) => { const p = [...(x.abilities.bgBonus.picks || [])]; p[i] = v; x.abilities.bgBonus.picks = p; }) })))) : null,
      ], { badge: asiBadge, open: asiBadge > 0 }),
      bg.feat.choose
        ? acc('bg-feat', `Feat: ${feat?.name || 'choose an Origin feat'}`, 'Origin feat of your choice', [h('p.muted', {}, 'Backgrounds from older books don\'t name a feat, so choose any Origin feat.'),
          featSlotUI(ctx, 'background', ['origin'], c.bgFeatId, (x, v) => { x.bgFeatId = v; x.featChoices.background = {}; })], { badge: featBadge, open: featBadge > 0 })
        : acc('bg-feat', `Feat: ${feat?.name}`, 'Origin feat', [rich(feat?.text || feat?.desc),
          featChoices(feat, c.featChoices.background || {}, (p) => update((x) => { x.featChoices.background = { ...(x.featChoices.background || {}), ...p }; }), { fixedList: bg.feat.list })], { badge: featBadge, open: featBadge > 0 }),
      acc('bg-skills', 'Skill Proficiencies', (bg.skills || []).map(skillName).join(', '), h('p', {}, `You are proficient in ${bg.skills.map(skillName).join(' and ')}.`)),
      bg.tool ? acc('bg-tool', 'Tool Proficiency', bg.tool, h('p', {}, `You are proficient with ${bg.tool}.`)) : null,
      (bg.equipment || []).length ? acc('bg-equip', 'Equipment', 'Chosen in step 5', h('p', {}, bg.equipment.map((o) => `Option ${o.id}: ${o.note || itemList(o)}`).join(' — or — '))) : null));
  }
  const D = c.details;
  const text = (key, label, multi) => h('div.field', {}, h('label', {}, label), multi
    ? h('textarea', { rows: 3, oninput: (e) => { D[key] = e.target.value; saveCharacter(c); } }, D[key] || '')
    : h('input', { value: D[key] || '', oninput: (e) => { D[key] = e.target.value; saveCharacter(c); } }));
  out.push(h('div.char-details', {},
    acc('cd-details', 'Character Details', 'Alignment · Faith · Lifestyle', [
      h('div.field', {}, h('label', {}, 'Alignment'), select({ value: D.alignment, placeholder: '— Choose an Option —', options: ALIGNMENTS.map((a) => ({ id: a, label: a })), onChange: (v) => update((x) => { x.details.alignment = v || ''; }) })),
      text('faith', 'Faith'),
      h('div.field', {}, h('label', {}, 'Lifestyle'), select({ value: D.lifestyle, placeholder: '— Choose an Option —', options: LIFESTYLES.map((a) => ({ id: a, label: a })), onChange: (v) => update((x) => { x.details.lifestyle = v || ''; }) })),
    ], { open: true }),
    acc('cd-physical', 'Physical Characteristics', 'Hair · Skin · Eyes · Height · Weight · Age · Gender',
      [h('div.grid2', {}, [['hair', 'Hair'], ['skin', 'Skin'], ['eyes', 'Eyes'], ['height', 'Height'], ['weight', 'Weight'], ['age', 'Age'], ['gender', 'Gender']].map(([k, l]) => text(k, l))), text('appearance', 'Appearance', true)]),
    acc('cd-personal', 'Personal Characteristics', 'Personality · Ideals · Bonds · Flaws',
      [['personality', 'Personality Traits'], ['ideals', 'Ideals'], ['bonds', 'Bonds'], ['flaws', 'Flaws']].map(([k, l]) => text(k, l, true))),
    acc('cd-notes', 'Notes', 'Organizations · Allies · Enemies · Backstory · Other',
      [['organizations', 'Organizations'], ['allies', 'Allies'], ['enemies', 'Enemies'], ['backstory', 'Backstory'], ['notes', 'Other']].map(([k, l]) => text(k, l, true)))));
  return out;
}

// ---------------------------------------------------------------- SPECIES
function speciesPreview(sp, onPick) {
  modal(sp.name, h('div.preview', {},
    h('div.pv-head', {}, speciesIcon(sp, true), h('p', {}, sp.desc)),
    h('div.facts', {}, fact('Size', sp.size), fact('Speed', `${sp.speed} ft`), fact('Darkvision', sp.darkvision ? `${sp.darkvision} ft` : '—')),
    h('h4', {}, 'Traits'), h('div.feature-list', {}, sp.traits.map((t) => h('details.feature', {}, h('summary', {}, t.level > 1 ? h('span.lv', {}, `Lv ${t.level}`) : null, t.name), t.text ? rich(t.text) : h('p', {}, t.desc))))),
  [{ label: 'Cancel' }, { label: `Choose ${sp.name}`, primary: true, onClick: onPick }]);
}

function speciesStep(ctx) {
  const { c, d, update } = ctx;
  const sp = d.species;
  if (!sp) {
    return [h('h2', {}, 'Choose Origin: Species'),
      ...sourceList('species', avail('species', c), { placeholder: 'Search species…', icon: (it) => speciesIcon(it), meta: (it) => `${sourceName(it)} · ${it.size} · Speed ${it.speed} ft`,
        onPick: (it) => speciesPreview(it, () => update((x) => { x.speciesId = it.id; x.speciesChoices = {}; x.featChoices.versatile = {}; })) })];
  }
  const sc = c.speciesChoices;
  const choiceFor = (t) => (sp.choices || []).find((ch) => ch.name.split(' (')[0] === t.name);
  const traitAccs = sp.traits.map((t) => {
    const ch = choiceFor(t);
    let ui = null; let badge = 0;
    if (ch?.type === 'skill') {
      const opts = ch.options === 'any' ? SKILLS.map((s) => s.id) : ch.options;
      ui = select({ value: sc[ch.id], placeholder: '— Choose a skill —', options: opts.map((id) => ({ id, label: skillName(id) })), onChange: (v) => update((x) => { x.speciesChoices[ch.id] = v; }) });
      badge = sc[ch.id] ? 0 : 1;
    } else if (ch?.type === 'origin-feat') {
      ui = featSlotUI(ctx, 'versatile', ['origin'], sc.versatile, (x, v) => { x.speciesChoices.versatile = v; x.featChoices.versatile = {}; });
      badge = sc.versatile ? featTodo(getFeat(sc.versatile), c.featChoices.versatile) : 1;
    } else if (ch) {
      ui = optionCards({ options: ch.options, value: sc[ch.id], onChange: (v) => update((x) => { x.speciesChoices[ch.id] = v; }) });
      badge = sc[ch.id] ? 0 : 1;
    }
    const locked = (t.level || 1) > c.level;
    return acc(`sp-${sp.id}-${t.name}`, t.name, locked ? `Unlocks at level ${t.level}` : null, [t.text ? rich(t.text, 'rich feature-desc') : h('p.feature-desc', {}, t.desc), ui], { badge, open: badge > 0 });
  });
  const langLeft = 2 - (c.languages || []).length;
  return [
    h('div.class-card', {}, speciesIcon(sp, true),
      h('div.cc-text', {}, h('h2', {}, sp.name), h('div.muted', {}, `${d.size} · Speed ${d.speed} ft${d.darkvision ? ` · Darkvision ${d.darkvision} ft` : ''}`)),
      h('button.btn.small', { onclick: () => confirmDialog('Change species?', 'Your species choices will be cleared.', () => update((x) => { x.speciesId = null; }), 'Change Species') }, 'Change Species')),
    h('p', {}, sp.desc),
    h('h3.section', {}, 'Species Traits'), traitAccs,
    acc('sp-lang', 'Languages', 'Common + two standard languages', [
      h('p.muted', {}, 'You know Common plus two languages of your choice from the Standard list. Your DM may allow a Rare language.'), counter((c.languages || []).length, 2),
      chips({ options: [...LANGUAGES.standard, ...LANGUAGES.rare].map((l) => ({ id: l, label: LANGUAGES.rare.includes(l) ? `${l} (Rare)` : l })), selected: c.languages, max: 2, onChange: (v) => update((x) => { x.languages = v; }) }),
    ], { badge: langLeft > 0 ? 1 : 0, open: langLeft > 0 }),
  ];
}

// ---------------------------------------------------------------- ABILITIES
function abilitiesStep({ c, d, update }) {
  const A = c.abilities;
  const setMethod = (m) => update((x) => {
    x.abilities.method = m; x.abilities.assigned = {};
    const v = m === 'point-buy' || m === 'standard' ? 8 : 10;
    x.abilities.base = Object.fromEntries(ABILITIES.map((a) => [a.id, v]));
  });
  const primary = d.cls?.primary || [];
  let methodUI = null;
  if (A.method === 'standard') {
    const assign = (ab, val) => update((x) => {
      const asg = x.abilities.assigned;
      for (const k of Object.keys(asg)) if (asg[k] === val) delete asg[k];
      if (val === null) delete asg[ab]; else asg[ab] = val;
      for (const a of ABILITIES) x.abilities.base[a.id] = asg[a.id] !== undefined ? STANDARD_ARRAY[asg[a.id]] : 8;
    });
    methodUI = h('div.method-grid', {}, ABILITIES.map((a) => h('div.method-cell', {}, h('label', {}, a.name, primary.includes(a.id) ? h('span.tag', {}, 'Primary') : null),
      h('select', { onchange: (e) => assign(a.id, e.target.value === '' ? null : Number(e.target.value)) }, h('option', { value: '' }, '--'),
        STANDARD_ARRAY.map((v, i) => h('option', { value: i, selected: A.assigned[a.id] === i, disabled: Object.entries(A.assigned).some(([k, j]) => j === i && k !== a.id) }, v))))));
  } else if (A.method === 'point-buy') {
    const spent = Object.values(A.base).reduce((s, v) => s + (POINT_BUY_COST[v] ?? 0), 0);
    methodUI = [h('p.points', {}, 'Points Remaining: ', h('b', {}, 27 - spent), ' / 27'),
      h('div.method-grid', {}, ABILITIES.map((a) => h('div.method-cell', {}, h('label', {}, a.name, primary.includes(a.id) ? h('span.tag', {}, 'Primary') : null),
        h('select', { onchange: (e) => update((x) => { x.abilities.base[a.id] = Number(e.target.value); }) }, Object.entries(POINT_BUY_COST).map(([v, cost]) => {
          const extra = cost - POINT_BUY_COST[A.base[a.id]];
          return h('option', { value: v, selected: Number(v) === A.base[a.id], disabled: extra > 27 - spent }, `${v} (${cost} pt${cost === 1 ? '' : 's'})`);
        })))))];
  } else if (A.method === 'manual') {
    const rollOne = (x, id) => { const r = roll('4d6kh3'); x.abilities.base[id] = r.total; return r; };
    methodUI = [h('div.row', {}, h('button.btn', { onclick: () => update((x) => { const res = ABILITIES.map((a) => rollOne(x, a.id).total); toast(`Rolled ${res.join(', ')}`); }) }, '🎲 Roll all (4d6, drop lowest)'),
      h('span.muted.tiny', {}, 'Or type the scores you rolled at the table.')),
    h('div.method-grid', {}, ABILITIES.map((a) => h('div.method-cell', {}, h('label', {}, a.name, primary.includes(a.id) ? h('span.tag', {}, 'Primary') : null),
      h('div.row.tight', {}, h('input.num', { type: 'number', min: 1, max: 30, value: A.base[a.id], onchange: (e) => update((x) => { x.abilities.base[a.id] = Math.max(1, Math.min(30, Number(e.target.value) || 10)); }) }),
        h('button.icon-btn', { type: 'button', title: 'Roll 4d6, drop lowest', onclick: () => update((x) => { const r = rollOne(x, a.id); toast(`${a.name}: ${r.parts[0].rolls.join(', ')} → ${r.total}`); }) }, '🎲')))))];
  }
  const unset = (id) => !A.method || (A.method === 'standard' && A.assigned[id] === undefined);
  const row = (label, value, cls = '') => h(`div.sc-row${cls}`, {}, h('span', {}, label), h('b', {}, value));
  const inputRow = (label, val, fn) => h('div.sc-row.input', {}, h('span', {}, label),
    h('input.num', { type: 'number', value: val ?? '', placeholder: '--', onchange: (e) => update((x) => fn(x, e.target.value === '' ? undefined : Number(e.target.value))) }));
  return [
    h('h2', {}, 'Ability Scores'),
    explain('How do ability scores work?', h('p', {}, 'Each ability has a score and a modifier. The modifier, (score − 10) ÷ 2 rounded down, is what you add to rolls.'),
      h('p', {}, 'Standard Array gives everyone the same fair numbers (15, 14, 13, 12, 10, 8). Point Buy lets you spend 27 points on scores from 8 to 15. Manual / Rolled lets you roll 4d6 and drop the lowest die, or type scores your group generated.'),
      h('p', {}, 'Your background increases are added automatically; see the Bonus row below.')),
    h('select.big-select', { onchange: (e) => setMethod(e.target.value || null) }, h('option', { value: '' }, '— Choose a Generation Method —'),
      [['standard', 'Standard Array'], ['manual', 'Manual / Rolled'], ['point-buy', 'Point Buy']].map(([v, l]) => h('option', { value: v, selected: A.method === v }, l))),
    methodUI,
    h('h3.section', {}, 'Score Calculations'),
    h('p.muted', {}, 'Your base scores plus every bonus. Use Other Modifier for anything the builder doesn\'t know about, or Override Score to set the total yourself.'),
    h('div.score-cards', {}, ABILITIES.map((a) => {
      const p = d.scoreParts[a.id];
      return h(`div.score-card${primary.includes(a.id) ? '.primary' : ''}`, {},
        h('div.sc-head', {}, a.name.toUpperCase()),
        row('Total Score', unset(a.id) ? '--' : p.total, '.hl'), row('Modifier', unset(a.id) ? '--' : fmt(d.mods[a.id]), '.hl'),
        row('Base Score', unset(a.id) ? '--' : p.base), row('Bonus', fmt(p.bonus)), row('Set Score', '0'), row('Stacking Bonus', '+0'),
        inputRow('Other Modifier', A.other?.[a.id], (x, v) => { x.abilities.other[a.id] = v; }),
        inputRow('Override Score', A.override?.[a.id], (x, v) => { x.abilities.override[a.id] = v; }));
    })),
  ];
}

// ---------------------------------------------------------------- EQUIPMENT
function equipmentStep({ c, d, update }) {
  const cls = d.cls; const bg = d.bg;
  const mode = c.equipment.mode || 'equipment';
  const kitsCls = cls?.equipment?.filter((o) => o.items.length || o.note) || [];
  const goldCls = cls?.equipment?.find((o) => !o.items.length && !o.note);
  const kitBg = bg?.equipment?.find((o) => o.items.length || o.note);
  const goldBg = bg?.equipment?.find((o) => !o.items.length && !o.note);
  const classKit = c.equipment.classOption && kitsCls.find((o) => o.id === c.equipment.classOption) ? c.equipment.classOption : kitsCls[0]?.id;

  const apply = (clsOptId, bgOptId) => update((x) => {
    const items = [];
    const add = (id, qty) => { const ex = items.find((i) => i.itemId === id); if (ex) ex.qty += qty; else items.push({ itemId: id, qty, equipped: false, source: 'starting' }); };
    let gp = 0;
    const notes = [];
    for (const o of [(cls.equipment || []).find((e) => e.id === clsOptId), (bg.equipment || []).find((e) => e.id === bgOptId)]) if (o) { o.items.forEach(([id, q]) => add(id, q)); gp += o.gp; if (o.note) notes.push(o.note); }
    if (notes.length) x.otherPossessions = [x.otherPossessions, ...notes.filter((n) => !(x.otherPossessions || '').includes(n))].filter(Boolean).join('\n');
    const armors = items.map((i) => getItem(i.itemId)).filter((it) => it?.type === 'armor' && it.armorType !== 'shield' && d.proficiencies.armor.includes(it.armorType));
    const best = armors.sort((a, b) => b.ac - a.ac)[0];
    items.forEach((i) => { const it = getItem(i.itemId); if (it === best || (it?.armorType === 'shield' && d.proficiencies.armor.includes('shield'))) i.equipped = true; });
    x.inventory = [...x.inventory.filter((i) => i.source !== 'starting'), ...items];
    x.currency.gp = gp;
    Object.assign(x.equipment, { classOption: clsOptId, bgOption: bgOptId, applied: true });
    toast(mode === 'gold' ? `Added ${gp} GP` : 'Starting equipment added');
  });

  let starting;
  if (!cls || !bg) starting = h('p.muted', {}, 'Choose a class and a background first — they decide your starting gear.');
  else if (mode === 'equipment') {
    starting = [
      h('h4', {}, `${cls.name} equipment`),
      optionCards({ options: kitsCls.map((o) => ({ id: o.id, name: `Option ${o.id}: ${o.label}`, desc: itemList(o) })), value: classKit, onChange: (v) => update((x) => { x.equipment.classOption = v; }) }),
      h('h4', {}, `${bg.name} equipment`),
      kitBg ? optionCards({ options: [{ id: kitBg.id, name: `Option ${kitBg.id}`, desc: itemList(kitBg) }], value: kitBg.id, onChange: () => {} }) : null,
      h('div.row', {}, h('button.btn.primary', { onclick: () => apply(classKit, kitBg?.id) }, c.equipment.applied ? 'Replace Starting Equipment' : 'Add Starting Equipment')),
    ];
  } else {
    const total = (goldCls?.gp || 0) + (goldBg?.gp || 0);
    starting = [h('p', {}, `Take gold instead of gear and buy your own equipment below: ${cls.name} ${goldCls?.gp || 0} GP + ${bg.name} ${goldBg?.gp || 0} GP = `, h('b', {}, `${total} GP`), '.'),
      h('div.row', {}, h('button.btn.primary', { onclick: () => apply(goldCls?.id, goldBg?.id) }, c.equipment.applied ? 'Replace with Starting Gold' : 'Add Starting Gold'))];
  }

  const invWeight = d.inventory.reduce((s, e) => s + (e.item.weight || 0) * e.qty, 0);
  const coins = Object.values(c.currency).reduce((a, b) => a + (Number(b) || 0), 0);
  const totalWeight = invWeight + (c.settings.ignoreCoinWeight === false ? coins / 50 : 0);
  const gpTotal = (c.currency.cp || 0) / 100 + (c.currency.sp || 0) / 10 + (c.currency.ep || 0) / 2 + (c.currency.gp || 0) + (c.currency.pp || 0) * 10;
  const equippable = (it) => it.type === 'armor' || it.type === 'weapon';
  const inventory = d.inventory.length ? h('table.inv', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Equip'), h('th', {}, 'Item'), h('th', {}, 'Qty'), h('th', {}, 'Weight'), h('th', {}))),
    h('tbody', {}, d.inventory.map((e) => h('tr', {},
      h('td', {}, equippable(e.item) ? h('input', { type: 'checkbox', checked: e.equipped, onchange: () => update((x) => {
        const it = x.inventory[e.idx]; it.equipped = !it.equipped;
        if (it.equipped && e.item.type === 'armor') x.inventory.forEach((o, j) => { const oi = getItem(o.itemId); if (j !== e.idx && oi?.type === 'armor' && (oi.armorType === 'shield') === (e.item.armorType === 'shield')) o.equipped = false; });
      }) }) : null),
      h('td', {}, e.item.name),
      h('td', {}, h('div.stepper.small', {}, h('button', { onclick: () => update((x) => { x.inventory[e.idx].qty--; if (x.inventory[e.idx].qty <= 0) x.inventory.splice(e.idx, 1); }) }, '−'), h('span', {}, e.qty), h('button', { onclick: () => update((x) => { x.inventory[e.idx].qty++; }) }, '+'))),
      h('td.muted', {}, e.item.weight ? `${+(e.item.weight * e.qty).toFixed(2)} lb` : '—'),
      h('td', {}, h('button.icon-btn', { title: 'Remove', onclick: () => update((x) => { x.inventory.splice(e.idx, 1); }) }, '✕'))))))
    : h('p.muted', {}, 'Your inventory is empty.');

  const catalog = avail('items', c).sort((a, b) => a.name.localeCompare(b.name));
  const visible = (it) => (!itemQuery.type || it.type === itemQuery.type) && it.name.toLowerCase().includes(itemQuery.q.toLowerCase());
  const rows = h('div.item-rows', {}, catalog.map((it) => h('div.item-row', { 'data-name': it.name.toLowerCase(), 'data-type': it.type, style: { display: visible(it) ? '' : 'none' } },
    h('div', {}, h('b', {}, it.name), h('div.muted.tiny', {}, it.type === 'weapon' ? `${cap(it.category)} weapon · ${it.damage} ${it.dtype}` : it.type === 'armor' ? `${cap(it.armorType)} · AC ${it.armorType === 'shield' ? '+2' : it.ac}` : it.type === 'magic-item' ? `${it.rarity}${it.attunement ? ' · requires attunement' : ''}` : (it.desc || 'Adventuring gear').slice(0, 90))),
    h('span.muted.tiny', {}, it.type === 'magic-item' ? it.category : `${it.cost ?? 0} GP · ${it.weight ?? 0} lb`),
    h('button.btn.small', { onclick: () => update((x) => { const ex = x.inventory.find((o) => o.itemId === it.id && !o.equipped); if (ex) ex.qty++; else x.inventory.push({ itemId: it.id, qty: 1, equipped: false }); toast(`Added ${it.name}`); }) }, 'Add'))));
  const refilter = () => rows.querySelectorAll('.item-row').forEach((r) => { r.style.display = (!itemQuery.type || r.dataset.type === itemQuery.type) && r.dataset.name.includes(itemQuery.q.toLowerCase()) ? '' : 'none'; });

  return [
    h('h2', {}, 'Choose Equipment'),
    acc('eq-start', 'Starting Equipment', c.equipment.applied ? '✓ Added' : 'Gear or gold from your class and background', [
      h('div.choose-mode', {}, h('div.muted.tiny', {}, 'Choose'), h('div.mode-toggle', {},
        h(`button${mode === 'equipment' ? '.on' : ''}`, { type: 'button', onclick: () => update((x) => { x.equipment.mode = 'equipment'; }) }, 'EQUIPMENT'), h('span', {}, 'or'),
        h(`button${mode === 'gold' ? '.on' : ''}`, { type: 'button', onclick: () => update((x) => { x.equipment.mode = 'gold'; }) }, 'GOLD'))),
      starting], { open: true, badge: c.equipment.applied ? 0 : 1 }),
    acc('eq-inv', `Current Inventory (${d.inventory.length})`, `Total Weight: ${+totalWeight.toFixed(1)} lb${c.settings.encumbrance !== 'none' ? ` of ${d.scores.str * 15} lb` : ''}`, inventory),
    acc('eq-other', 'Other Possessions', 'Anything not in the item list', h('textarea', { rows: 3, placeholder: 'A locket from home, a map of the old mine…', oninput: (e) => { c.otherPossessions = e.target.value; saveCharacter(c); } }, c.otherPossessions || '')),
    acc('eq-add', 'Add Items', `${catalog.length} items available`, [
      h('div.filters', {},
        h('input', { type: 'search', placeholder: 'Search items…', value: itemQuery.q, oninput: (e) => { itemQuery.q = e.target.value; refilter(); } }),
        h('select', { onchange: (e) => { itemQuery.type = e.target.value; refilter(); } }, [['', 'All types'], ['weapon', 'Weapons'], ['armor', 'Armor'], ['gear', 'Gear & Tools'], ['magic-item', 'Magic Items']].map(([v, l]) => h('option', { value: v, selected: itemQuery.type === v }, l)))),
      rows]),
    acc('eq-cur', 'Currency', `Total in GP: ${+gpTotal.toFixed(2)}`, h('div.currency', {}, [['cp', 'Copper'], ['sp', 'Silver'], ['ep', 'Electrum'], ['gp', 'Gold'], ['pp', 'Platinum']].map(([k, l]) => h('label', {}, l,
      h('input.num', { type: 'number', min: 0, value: c.currency[k] || 0, onchange: (e) => update((x) => { x.currency[k] = Math.max(0, Number(e.target.value) || 0); }) }))))),
  ];
}

// ---------------------------------------------------------------- WHAT'S NEXT
function nextStep({ c, d, todo }) {
  const left = Object.entries(todo).flatMap(([s, list]) => list.map((m) => ({ s, m })));
  return [
    h('h2', {}, "What's Next?"),
    h('div.summary-card', {}, portraitEl(c, 'portrait big'), h('div', {},
      h('h3', {}, c.name || 'Unnamed character'),
      h('div.muted', {}, `Level ${c.level} ${d.species?.name || ''} ${d.cls?.name || ''}${d.sub ? ` · ${d.sub.name}` : ''}${d.bg ? ` · ${d.bg.name}` : ''}`),
      h('div.stat-chips', {}, [['HP', d.hpMax], ['AC', d.ac], ['Speed', `${d.speed} ft`], ['Initiative', fmt(d.initiative)], ['Proficiency', fmt(d.pb)]].map(([k, v]) => h('span.stat-chip', {}, h('small', {}, k), h('b', {}, v)))))),
    left.length
      ? h('div.warnbox', {}, h('strong', {}, `${plural(left.length, 'choice')} left to make`), h('ul', {}, left.map(({ s, m }) => h('li', {}, h('a', { href: `#build-${c.id}-${s}` }, STEPS.find((x) => x.id === s).short), ' — ', m))))
      : h('div.okbox', {}, '✓ Your character is complete and ready to play!'),
    h('div.next-actions', {},
      h('a.btn.primary.big', { href: `#sheet-${c.id}` }, 'View Character Sheet'),
      h('button.btn', { onclick: () => copyText(exportCharacter(c)) }, 'Copy as JSON'),
      h('a.btn', { href: '#home' }, 'My Characters')),
    h('div.card', {}, h('h3', {}, 'Tips'), h('ul.compact', {},
      h('li', {}, 'Click any number on the sheet to roll it. The dice tray (bottom right) has advantage, disadvantage and custom rolls.'),
      h('li', {}, 'Level up any time from step 1 — new features and choices appear with red badges.'),
      h('li', {}, 'Your character is saved in this browser. Use Copy as JSON (or Export on the sheet) to move it to another device.'))),
  ];
}
