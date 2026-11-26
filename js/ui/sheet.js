// Interactive character sheet, laid out like D&D Beyond's: click anything with a modifier to roll it.
import { h, cap, modal, toast, copyText, downloadText, portraitEl, rich } from './dom.js';
import { ABILITIES, SKILLS, CONDITIONS, WEAPON_MASTERIES, all, getItem, getSpell } from '../data/index.js';
import { compute, fmt, XP_TABLE, advantageFor, rollKeys } from '../engine/rules.js';
import { quickPanel, removeSpell } from './quick-edit.js';
import { saveCharacter, exportCharacter, listCharacters } from '../engine/store.js';
import { levelUpWizard } from './level-up.js';
import { SECONDARY_DAMAGE } from '../data/srd/spell-secondary.js';
import { ammoName, ammoCount, ammoKindOfItem, spendAmmo, recoverAmmo, consumableOf, useOne, critDice } from '../engine/consumables.js';
import { recordChange, undoLast, showUndo, hideUndo, undoDepth, lastLabel } from './undo.js';
import { applyAppearance, customizeDialog } from './sheet-style.js';
import { rollDice } from './dicelog.js';

// View state that survives re-renders (not saved with the character).
const view = { panel: null, tab: 'actions', act: 'all', spellLevel: 'all', spellQuery: '', feat: 'all', open: new Set() };

const COMBAT_ACTIONS = [
  ['Attack', 'Make one attack with a weapon or an Unarmed Strike (more with Extra Attack).'], ['Dash', 'Gain extra movement equal to your Speed for this turn.'],
  ['Disengage', 'Your movement doesn’t provoke Opportunity Attacks for the rest of the turn.'], ['Dodge', 'Attacks against you have Disadvantage and you have Advantage on DEX saves until your next turn.'],
  ['Grapple', 'Unarmed Strike option: the target makes a STR or DEX save (DC 8 + STR mod + PB) or has the Grappled condition.'], ['Help', 'Give an ally Advantage on their next check or attack against a creature near you.'],
  ['Hide', 'Make a DEX (Stealth) check (DC 15) while out of sight to gain the Invisible condition.'], ['Improvise', 'Do something not covered by another action; the DM decides what it needs.'],
  ['Influence', 'Try to sway a creature with a CHA (or WIS) check.'], ['Magic', 'Cast a spell, use a magic item, or use a magical feature.'],
  ['Ready', 'Prepare an action (or move) to take as a Reaction to a trigger you choose.'], ['Search', 'Make a WIS check (Insight, Medicine, Perception or Survival) to find something.'],
  ['Shove', 'Unarmed Strike option: the target makes a STR or DEX save or is pushed 5 ft or knocked Prone.'], ['Study', 'Make an INT check (Arcana, History, Investigation, Nature or Religion) to recall or analyze.'],
  ['Utilize', 'Use a nonmagical object.'],
];
const ORD = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const ABBR = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA' };

// ------------------------------------------------------------------ spell helpers
const timeKind = (t = '') => (/^(1\s+)?bonus action/i.test(t) ? 'bonus' : /^(1\s+)?reaction/i.test(t) ? 'reaction' : /^(1\s+)?action/i.test(t) ? 'action' : 'other');
const timeAbbr = (t = '') => {
  const k = timeKind(t); if (k === 'bonus') return '1BA'; if (k === 'reaction') return '1R'; if (k === 'action') return '1A';
  const m = t.match(/^(\d+)\s*(minute|hour|day|round)/i); return m ? `${m[1]}${m[2][0].toLowerCase()}` : t.split(/[ ,]/)[0] || '—';
};
const rangeAbbr = (r = '') => r.replace(/\bfeet\b/i, 'ft.').replace(/\bfoot\b/i, 'ft.').replace(/^Self\s*\((.+)\)$/i, 'Self ($1)');
const durAbbr = (sp) => {
  const d = (sp.duration || '').replace(/^Concentration,?\s*/i, '').replace(/^up to\s*/i, '');
  if (/^instantaneous/i.test(d)) return '';
  const m = d.match(/^(\d+)\s*(round|minute|hour|day)/i); return m ? `${m[1]}${/^round/i.test(m[2]) ? 'Rnd' : m[2][0].toLowerCase()}` : d;
};
const compAbbr = (c = '') => (c.match(/\b[VSM]\b/g) || []).join('/');
const spellSave = (sp) => sp.save || ABBR[(String(sp.desc || '').match(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i) || [])[1]?.toLowerCase()]?.toLowerCase();
/** Level a spell is actually cast at: Pact Magic always uses the pact slot level (D&D Beyond shows them that way too). */
const castLevel = (sp, d) => (sp.level > 0 && d?.spellcasting?.pact ? Math.max(sp.level, d.spellcasting.pact.level) : sp.level);
const spellDamage = (sp, level, d, atLevel) => {
  const m = String(sp.damage || '').match(/^(\d+)d(\d+)(.*)$/); if (!m) return null;
  let count = Number(m[1]) * (sp.level === 0 ? 1 + (level >= 5) + (level >= 11) + (level >= 17) : 1);
  const up = String(sp.higherLevel || '').match(/increases by (\d+)d(\d+) for each (?:spell )?slot level above (\d+)/i);
  const at = atLevel ?? castLevel(sp, d);
  if (up && sp.level > 0 && up[2] === m[2] && at > Number(up[3])) count += Number(up[1]) * (at - Number(up[3]));
  const bonus = d?.spellDamageBonus?.[sp.id] || 0;
  return { dice: `${count}d${m[2]}${bonus ? fmt(bonus) : ''}`, type: m[3].trim(), upcast: at > sp.level };
};
/** The second damage roll of a two-part spell (Ice Knife's explosion, Acid Arrow's later acid), scaled like the first. */
const spellDamage2 = (sp, level, d, atLevel) => {
  const x = SECONDARY_DAMAGE[sp.id]; if (!x) return null;
  const r = spellDamage({ ...sp, id: `${sp.id}#2`, damage: x.damage }, level, d, atLevel);
  return r && { ...r, label: x.label, short: x.short, save: x.save };
};
/** Hit / DC cell: attack roll, save DC, or both (Ice Knife: +6 to hit, then a DEX save). */
const hitDcCell = (sp, cs, save) => {
  const atk = sp.attack ? rollBtn(`${sp.name} attack`, `1d20${fmt(cs.attack)}`, fmt(cs.attack), { d20: true, keys: rollKeys.spell() }) : null;
  const sv = save ? h('span.dc', { title: `${save.toUpperCase()} saving throw` }, h('small', {}, save.toUpperCase()), cs.dc) : null;
  return atk && sv ? h('div.hit-dc', {}, atk, sv) : atk || sv || '--';
};
const dmgStack = (sp, dmg, dmg2) => (dmg2 ? h('div.dmg-stack', {}, dmgCell(sp.name, dmg.dice, dmg.type), h('div', { title: dmg2.label }, dmgCell(`${sp.name} (${dmg2.short})`, dmg2.dice, dmg2.type, h('span.dmg2-tag', {}, `· ${dmg2.short}`)))) : dmgCell(sp.name, dmg.dice, dmg.type));
const heals = (sp) => /regains? (a number of )?hit points|becomes stable/i.test(sp.desc || '');
const CONDITION_RE = /\b(Blinded|Charmed|Deafened|Frightened|Grappled|Incapacitated|Invisible|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious)\b(?= condition)/;
/** Short effect label when a spell does no damage: Healing, or the condition it causes. */
const effectOf = (sp) => (heals(sp) ? 'Healing' : (String(sp.desc || '').match(CONDITION_RE) || [])[1] || null);

/** Every spell the character can use, with where it comes from. */
function spellEntries(c, d) {
  const seen = new Set(); const out = [];
  const add = (id, source, free, extra = {}) => { if (seen.has(id)) return; const sp = getSpell(id); if (!sp) return; seen.add(id); out.push({ sp, source, free, ...extra }); };
  for (const id of c.spells.cantrips) add(id, d.cls?.name);
  for (const id of c.spells.prepared) add(id, d.cls?.name, false, { classPrepared: true });
  for (const g of d.grantedSpells) add(g.spellId, g.source, !g.castable, { freePerLongRest: g.freePerLongRest || 0 });
  return out.sort((a, b) => a.sp.level - b.sp.level || a.sp.name.localeCompare(b.sp.name));
}
/** Spell attack bonus and save DC (falls back to PB + best mental modifier for characters without a spellcasting class). */
const casting = (d) => d.spellcasting || { attack: d.pb + Math.max(d.mods.int, d.mods.wis, d.mods.cha), dc: 8 + d.pb + Math.max(d.mods.int, d.mods.wis, d.mods.cha), slots: [], pact: null };

// ------------------------------------------------------------------ feature helpers
/** Which kind of action a feature uses: the first of Bonus Action / Reaction / Action its text mentions. */
function featureKind(f, d) {
  const k = d?.actionKinds?.[String(f.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()];
  if (k) return k === 'none' ? null : k;
  const t = String(f.text || f.desc || '');
  const hits = [
    ['bonus', t.search(/\bBonus Action\b/i)],
    ['reaction', t.search(/\b(as a|use your|take a|your) Reaction\b/i)],
    ['action', t.search(/\b(as an? (Magic )?action|take the (Magic|Attack|Utilize|Study|Search|Influence) action|(Magic|Utilize|Study|Search|Influence) action)\b/i)],
  ].filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  return hits[0]?.[0] || null;
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isLimited = (f, d) => d.resources.some((r) => norm(r.name) === norm(f.name)) || /\b(once per (long|short) rest|per (long|short) rest|proficiency bonus times|regain all expended uses)\b/i.test(f.text || f.desc || '');

// ------------------------------------------------------------------ main view
export function renderSheet(root, c, go) {
  const d = compute(c);
  current = c;
  const rerender = () => renderSheet(root, c, go);
  closePanel = () => { if (view.panel && root.isConnected) { view.panel = null; rerender(); } };
  // Every change goes through update(), which keeps a snapshot for Undo.
  const update = (fn, label) => {
    if (recordChange(c, fn, label, d.hpMax)) { saveCharacter(c); showUndo(lastLabel(), doUndo, undoDepth()); }
    rerender();
  };
  const doUndo = () => {
    const l = undoLast(c); if (!l) return;
    saveCharacter(c); rerender();
    if (undoDepth()) showUndo(`Undone: ${l}`, doUndo, undoDepth()); else { hideUndo(); toast(`Undone: ${l}`); }
  };
  sheetUndo = () => (root.isConnected ? doUndo() : null);
  const cur = c.hp.current ?? d.hpMax;
  exPenalty = d.d20Penalty || 0;
  const d20 = (label, bonus, keys) => { const [l, x] = withExhaustion(label, `1d20${fmt(bonus)}`, true); rollDice(l, x, { d20: true, adv: netAdv(keys) }); };

  // Header: portrait, name, subtitle, level / XP bar, rests
  const D = c.details || {};
  const xpBar = c.settings.advancement === 'xp' && c.level < 20 ? (() => {
    const lo = XP_TABLE[c.level - 1]; const hi = XP_TABLE[c.level]; const pct = Math.max(0, Math.min(100, ((c.xp || 0) - lo) / (hi - lo) * 100));
    return h('div.xp', {}, h('div.xp-ends', {}, h('span', {}, `LVL ${c.level}`), h('span', {}, `LVL ${c.level + 1}`)), h('div.xp-bar', {}, h('i', { style: `width:${pct}%` })),
      h('div.xp-num', {}, `${(c.xp || 0).toLocaleString()} / ${hi.toLocaleString()} XP`));
  })() : h('div.xp', {}, h('div.xp-ends', {}, h('span', {}, `LVL ${c.level}`)));
  const header = h('header.ds-head', {},
    h('div.ds-id', {}, portraitEl(c, 'ds-portrait'),
      h('div', {}, h('h1', {}, c.name || 'Unnamed Adventurer', h('a.ds-manage', { href: `#build-${c.id}-class`, title: 'Open in the builder' }, 'Manage')),
        h('div.ds-sub', {}, [D.gender, d.species?.name, `${d.cls?.name || ''} ${c.level}`, d.sub ? `(${d.sub.name})` : null].filter(Boolean).join(' ')), xpBar)),
    h('div.ds-buttons', {},
      c.level < 20 && d.cls ? h('button.ds-btn.levelup-btn', { title: `Level up to ${c.level + 1}`, onclick: () => levelUpWizard(c, update, go) }, '⬆ Level Up') : null,
      h('button.ds-btn', { onclick: () => shortRest(c, d, update) }, '⛺ Short Rest'),
      h('button.ds-btn', { onclick: () => update((x) => longRest(x, d), 'Long Rest') }, '☾ Long Rest'),
      h('button.ds-btn', { title: 'Colours, background and layout', onclick: () => customizeDialog(c, { sheetEl: () => root.querySelector('.dsheet'), listCharacters, save: (done) => { saveCharacter(c); if (done) rerender(); } }) }, '🎨 Customize'),
      h(`button.ds-btn${view.panel ? '.on' : ''}`, { title: 'Quick adjustments: numbers, proficiency, advantage, spells, items', onclick: () => { view.panel = view.panel ? null : { kind: 'adjust', arg: 'combat' }; rerender(); } }, '⚙ Adjust'),
      h('a.ds-btn', { href: `#build-${c.id}-class` }, '✎ Edit'),
      h('button.ds-btn', { onclick: () => exportDialog(c) }, '⇩ Export')));

  // Top row: abilities, proficiency, speed, inspiration, hit points
  const abilityBox = (a) => {
    const scoresFirst = c.settings.abilityDisplay === 'scores';
    return h('button.ds-ability', { onclick: () => d20(`${a.name} check`, d.mods[a.id], rollKeys.check(a.id)), title: `Roll a ${a.name} check` },
      h('span.lbl', {}, a.name.toUpperCase(), advBadge(rollKeys.check(a.id))),
      h('span.big', {}, scoresFirst ? d.scores[a.id] : fmt(d.mods[a.id])),
      h('span.oval', {}, scoresFirst ? fmt(d.mods[a.id]) : d.scores[a.id]));
  };
  const hpBox = h('div.ds-frame.ds-hp', {},
    h('form.hp-adj', { onsubmit: (e) => e.preventDefault() },
      h('button.heal', { type: 'button', onclick: (e) => { const n = Number(e.target.form.amt.value) || 0; update((x) => { x.hp.current = Math.min(d.hpMax, cur + n); if (x.hp.current > 0) x.deathSaves = { success: 0, fail: 0 }; }); } }, 'HEAL'),
      h('input', { type: 'number', min: 0, name: 'amt', 'aria-label': 'Amount' }),
      h('button.dmg', { type: 'button', onclick: (e) => { const dealt = Number(e.target.form.amt.value) || 0; let n = dealt; update((x) => { const t = Math.min(x.hp.temp || 0, n); x.hp.temp = (x.hp.temp || 0) - t; n -= t; x.hp.current = Math.max(0, cur - n); if (x.hp.current === 0 && x.concentration) { toast(`Unconscious: concentration on ${getSpell(x.concentration.spellId)?.name || 'the spell'} ends`); x.concentration = null; } }); if (dealt > 0 && c.concentration) concentrationCheck(c, d, update, dealt); } }, 'DAMAGE')),
    cur === 0 ? deathSaves(c, update) : h('div.hp-nums', {},
      h('div', {}, h('small', {}, 'CURRENT'), h('b', {}, cur)), h('span.slash', {}, '/'),
      h('div', {}, h('small', {}, 'MAX'), h('b', {}, d.hpMax, adjMark(d, 'hp'))),
      h('div', {}, h('small', {}, 'TEMP'), h('input.temp', { type: 'number', min: 0, value: c.hp.temp || '', placeholder: '--', onchange: (e) => update((x) => { x.hp.temp = Math.max(0, Number(e.target.value) || 0); }) }))),
    h('div.ds-caption', {}, 'HIT POINTS', h('span.hd', { title: 'Hit Dice left' }, ` · Hit Dice ${c.level - (c.used.hitDice || 0)}/${c.level} d${d.hitDie}`)));

  const top = h('div.ds-top', {},
    h('div.ds-abilities', {}, ABILITIES.map(abilityBox)),
    h('div.ds-frame.ds-mini', {}, h('span.lbl', {}, 'PROFICIENCY'), h('span.box', {}, fmt(d.pb)), h('span.ds-caption', {}, 'BONUS')),
    h('div.ds-frame.ds-mini', {}, h('span.lbl', {}, 'WALKING'), h('span.box.plain', {}, d.speed, h('small', {}, ' ft.'), adjMark(d, 'speed')), h('span.ds-caption', {}, 'SPEED')),
    h(`button.ds-frame.ds-mini.inspo${c.heroicInspiration ? '.on' : ''}`, { title: 'Heroic Inspiration: reroll any die, once', onclick: () => update((x) => { x.heroicInspiration = !x.heroicInspiration; }) },
      h('span.gem', {}, c.heroicInspiration ? '★' : ''), h('span.ds-caption', {}, 'HEROIC INSPIRATION')),
    hpBox);

  // Left column
  const saves = h('div.ds-frame.ds-saves', {},
    h('div.save-grid', {}, ABILITIES.map((a) => h('button.save', { onclick: () => d20(`${a.name} save`, d.saves[a.id].mod, rollKeys.save(a.id)) },
      h(`span.pdot${d.saves[a.id].prof ? '.on' : ''}`), h('span.ab', {}, a.short.toUpperCase()), h('span.val', {}, fmt(d.saves[a.id].mod), adjMark(d, `save:${a.id}`)), advBadge(rollKeys.save(a.id))))),
    d.saveNotes.length ? h('div.save-notes', {}, d.saveNotes.map((n) => h('div', {}, h('span.adv', {}, 'A'), ` ${n.replace(/^advantage\s*/i, '')}`))) : null,
    (c.custom?.adv || []).filter((x) => /^(save:all|death|concentration)$/.test(x.target)).map((x) => h('div.save-notes', {}, h('div', {}, h(`span.adv${x.kind === 'dis' ? '.dis' : ''}`, {}, x.kind === 'dis' ? 'D' : 'A'), ` ${{ 'save:all': 'on all saving throws', death: 'on Death Saving Throws', concentration: 'on Concentration saves' }[x.target]}${x.note ? ` ${x.note}` : ''}`))),
    h('div.ds-caption', {}, 'SAVING THROWS', gear('Adjust saving throws, advantage and disadvantage', { kind: 'adjust', arg: 'saves' }, rerender)));
  const senses = h('div.ds-frame.ds-senses', {},
    [['PASSIVE PERCEPTION', d.passivePerception], ['PASSIVE INVESTIGATION', d.passiveInvestigation], ['PASSIVE INSIGHT', d.passiveInsight]].map(([l, v]) => h('div.sense', {}, h('b', {}, v, adjMark(d, `passive:${l.split(' ')[1].toLowerCase()}`)), h('span', {}, l))),
    h('div.sense-extra', {}, d.darkvision ? `Darkvision ${d.darkvision} ft.` : 'Additional Sense Types'),
    h('div.ds-caption', {}, 'SENSES', gear('Adjust passive scores', { kind: 'adjust', arg: 'combat' }, rerender)));
  const training = h('div.ds-frame.ds-training', {},
    [['ARMOR', d.proficiencies.armor.map((a) => (a === 'shield' ? 'Shields' : `${cap(a)} Armor`)).join(', ')],
      ['WEAPONS', d.proficiencies.weapons.map((w) => `${cap(w.replace(/-/g, ' '))}${/^(simple|martial)$/.test(w) ? ' Weapons' : ''}`).join(', ')],
      ['TOOLS', d.proficiencies.tools.join(', ')], ['LANGUAGES', d.proficiencies.languages.join(', ')]]
      .map(([l, v]) => h('div.train', {}, h('h4', {}, l), h('p', {}, v || 'None'))),
    h('div.ds-caption', {}, 'PROFICIENCIES & TRAINING'));

  // Middle column: skills
  const skills = h('div.ds-frame.ds-skills', {},
    h('div.sk-head', {}, h('span', {}, 'PROF'), h('span', {}, 'MOD'), h('span', {}, 'SKILL'), h('span', {}, 'BONUS')),
    SKILLS.map((s) => { const k = d.skills[s.id]; return h('button.sk', { onclick: () => d20(`${s.name} check`, k.mod, rollKeys.skill(s)), title: k.expert ? 'Expertise' : k.prof ? 'Proficient' : k.half ? 'Half proficiency' : 'Not proficient' },
      h(`span.pdot${k.expert ? '.expert' : k.prof ? '.on' : k.half ? '.half' : ''}`), h('span.mod', {}, s.ability.toUpperCase()), h('span.name', {}, s.name, advBadge(rollKeys.skill(s))), h('span.val', {}, fmt(k.mod), adjMark(d, `skill:${s.id}`))); }),
    h('div.ds-caption', {}, 'SKILLS', gear('Adjust skills, proficiency, advantage and disadvantage', { kind: 'adjust', arg: 'skills' }, rerender)));

  // Right column: initiative, armor, defenses & conditions, then the tabbed panel
  const conds = [...c.conditions.map((id) => CONDITIONS.find((x) => x.id === id)?.name), c.exhaustion ? `Exhaustion ${c.exhaustion}` : null].filter(Boolean);
  const combat = h('div.ds-combat', {},
    h('button.ds-init', { onclick: () => d20('Initiative', d.initiative, rollKeys.initiative()) }, h('span.lbl', {}, 'INITIATIVE', advBadge(rollKeys.initiative())), h('span.box', {}, fmt(d.initiative), adjMark(d, 'initiative'))),
    h('div.ds-ac', { title: d.acNote }, h('span.lbl', {}, 'ARMOR'), h('b', {}, d.ac, adjMark(d, 'ac')), h('span.lbl', {}, 'CLASS'), gear('Adjust AC, initiative, speed, HP', { kind: 'adjust', arg: 'combat' }, rerender)),
    h('div.ds-frame.ds-defcond', {},
      h('div', {}, h('h4', {}, 'DEFENSES'), d.resist.length || d.defenses.length
        ? [...d.resist.map((r) => h('div.def', { title: 'Resistance' }, h('span.shield', {}, '⛉'), ` ${cap(r)}`)), ...d.defenses.map((x) => h('div.def', { title: x.split(':')[0] }, h('span.shield.imm', {}, '⛉'), ` ${x.split(':').slice(1).join(':').trim() || x}`))]
        : h('div.muted', {}, '—')),
      h('button.cond-btn', { onclick: () => conditionsDialog(c, update) }, h('h4', {}, 'CONDITIONS'), conds.length ? conds.map((x) => h('div', {}, x)) : h('div.muted', {}, 'Add Active Conditions'))));

  const TABS = [['actions', 'Actions'], ['spells', 'Spells'], ['inventory', 'Inventory'], ['features', 'Features & Traits'], ['background', 'Background'], ['notes', 'Notes']];
  const panel = h('div.ds-frame.ds-panel', {},
    h('nav.ds-tabs', {}, TABS.map(([id, l]) => h(`button${view.tab === id ? '.on' : ''}`, { onclick: () => { view.tab = id; rerender(); } }, l.toUpperCase()))),
    h('div.ds-tab-body', {}, ({ actions: actionsTab, spells: spellsTab, inventory: inventoryTab, features: featuresTab, background: backgroundTab, notes: notesTab }[view.tab] || actionsTab)(c, d, update, rerender)));

  // Keep the side panel's scroll position and focused field across re-renders.
  const sideScroll = root.querySelector('.ds-side .side-body')?.scrollTop || 0;
  const focusKey = document.activeElement?.dataset?.k;
  root.replaceChildren(h('div.dsheet', {},
    header,
    concBar(c, update),
    d.warnings.length ? h('div.ds-warn', {}, '⚠ ', d.warnings.slice(0, 3).join(' '), d.warnings.length > 3 ? ` (+${d.warnings.length - 3} more)` : '', ' ', h('a', { href: `#build-${c.id}-class` }, 'Finish in builder')) : null,
    top,
    h('div.ds-body', {},
      h('div.ds-left', {}, saves, senses, training),
      h('div.ds-mid', {}, skills),
      h('div.ds-right', {}, combat, panel)),
    view.panel ? quickPanel(c, d, update, view, rerender) : null));
  applyAppearance(root.querySelector('.dsheet'), c);
  const side = root.querySelector('.ds-side');
  if (side) side.style.top = `${Math.max(0, document.querySelector('.appbar')?.getBoundingClientRect().bottom || 0)}px`; // sits under the app bar
  const sb = root.querySelector('.ds-side .side-body'); if (sb) sb.scrollTop = sideScroll;
  if (focusKey) {
    // A change event fires just before Tab moves focus, so after the re-render move it on ourselves.
    const dir = tabDir; setTimeout(() => {
      const el = root.querySelector(`[data-k="${CSS.escape(focusKey)}"]`); if (!el) return;
      if (dir && (document.activeElement === document.body || !document.activeElement?.isConnected)) {
        const list = [...root.querySelectorAll('.ds-side input, .ds-side select, .ds-side button, .ds-side textarea')].filter((x) => !x.disabled);
        (list[list.indexOf(el) + dir] || el).focus();
      } else if (!dir && (document.activeElement === document.body)) el.focus();
    }, 0);
  }
}

// ------------------------------------------------------------------ shared bits
const chips = (opts, value, onPick) => h('div.ds-chips', {}, opts.map(([id, label]) => h(`button${value === id ? '.on' : ''}`, { onclick: () => onPick(id) }, label)));
// The character being shown, so roll buttons can apply its advantage/disadvantage entries.
let current = null;
let closePanel = () => {};
let tabDir = 0;
if (typeof document !== 'undefined') { document.addEventListener('keydown', (e) => { if (e.key === 'Tab') tabDir = e.shiftKey ? -1 : 1; }, true); document.addEventListener('keyup', () => { setTimeout(() => { tabDir = 0; }, 0); }, true); }
if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('.modal-backdrop, dialog[open]')) closePanel(); });
// Ctrl+Z / Cmd+Z on the sheet undoes the last change (text boxes keep their own undo).
let sheetUndo = () => null;
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, textarea, [contenteditable], .modal-backdrop') && location.hash.startsWith('#sheet-')) { e.preventDefault(); sheetUndo(); }
  });
  window.addEventListener('hashchange', hideUndo);
}
const netAdv = (keys) => { if (!current || !keys) return 0; const a = advantageFor(current, keys); return Math.sign(a.adv.length) - Math.sign(a.dis.length); };
/** A/D badge for a roll, if any entry applies. */
const advBadge = (keys) => {
  if (!current) return null; const a = advantageFor(current, keys); if (!a.adv.length && !a.dis.length) return null;
  const tip = [...a.adv.map((x) => `Advantage${x.note ? `: ${x.note}` : ''}`), ...a.dis.map((x) => `Disadvantage${x.note ? `: ${x.note}` : ''}`)].join('\n');
  return a.adv.length && a.dis.length ? h('span.adv.both', { title: `${tip}\n(they cancel out)` }, 'A/D') : h(`span.adv${a.dis.length ? '.dis' : ''}`, { title: tip }, a.dis.length ? 'D' : 'A');
};
// Exhaustion takes 2 per level off every D20 Test rolled from the sheet.
let exPenalty = 0;
const withExhaustion = (label, expr, d20) => (d20 && exPenalty ? [`${label} (Exhaustion −${exPenalty})`, `${expr}-${exPenalty}`] : [label, expr]);
const rollBtn = (label, expr, text, opts = {}) => h('button.ds-roll', { onclick: (e) => { e.stopPropagation(); const [l, x] = withExhaustion(label, expr, opts.d20); const r = rollDice(l, x, { ...opts, adv: netAdv(opts.keys) }); opts.after?.(r); } }, text ?? expr, opts.keys ? advBadge(opts.keys) : null);
/** Small gear on a panel caption that opens the quick-edit side panel. */
const gear = (title, panel, rerender) => h('button.ds-gear', { title, onclick: (e) => { e.stopPropagation(); view.panel = panel; rerender(); } }, '⚙');
const adjMark = (d, key) => (d.adjusted?.has(key) ? h('i.adj-dot', { title: 'Adjusted by hand (⚙ to change)' }) : null);
const dmgCell = (name, dice, type, extra) => h('div.dmg', {}, rollBtn(`${name} damage`, dice), type ? h('span.dtype', {}, type) : null, extra || null);

function usePips(c, r, update) {
  const used = c.used.resources[r.id] || 0;
  if (r.max > 10) {
    return h('div.uses-num', {}, h('input', { type: 'number', min: 0, max: r.max, value: r.max - used, onchange: (e) => update((x) => { x.used.resources[r.id] = r.max - Math.max(0, Math.min(r.max, Number(e.target.value) || 0)); }) }), h('span', {}, `/ ${r.max}`));
  }
  return h('div.uses', {}, Array.from({ length: r.max }, (_, i) => h(`button.box${i < used ? '.used' : ''}`, { title: i < used ? 'Used — click to restore' : 'Available — click to use', onclick: () => update((x) => { x.used.resources[r.id] = i < used ? i : i + 1; }) })));
}
const resetText = (r) => `${r.max} / ${r.reset === 'short' ? 'Short Rest' : 'Long Rest'}`;

/** A feature as shown in the Actions tab: name, uses, text (long text folds). */
function featureBlock(f, c, d, update) {
  const r = d.resources.find((x) => norm(x.name) === norm(f.name));
  const text = String(f.text || f.desc || '');
  const key = `f:${f.source}:${f.name}`;
  const long = text.length > 420;
  return h('div.act-feature', {},
    h('div.af-head', {}, h('b', {}, f.name), h('span.af-src', {}, f.source), r ? [usePips(c, r, update), h('span.af-reset', {}, resetText(r))] : null, f.extra ? rollBtn(f.name, f.extra) : null),
    long && !view.open.has(key)
      ? h('div.af-text', {}, rich(`${text.slice(0, 380).replace(/\s+\S*$/, '')}…`), h('button.linkish', { onclick: () => { view.open.add(key); update(() => {}); } }, 'Show more'))
      : h('div.af-text', {}, rich(text)));
}

/** Spell slot tracker: one row of boxes per slot level (or Pact Magic). Click a box to mark a slot used or regain it. */
function slotTracker(c, d, update) {
  const sc = d.spellcasting; if (!sc) return null;
  const row = (label, max, used, set) => h('div.slot-track', {}, h('span.st-lbl', {}, label),
    h('div.slots', {}, Array.from({ length: max }, (_, i) => h(`button.box${i < used ? '.used' : ''}`, { title: i < used ? 'Used — click to regain' : 'Available — click to mark used', 'aria-label': `${label} slot ${i + 1}${i < used ? ' (used)' : ''}`, onclick: () => update((x) => set(x, i < used ? i : i + 1)) }))),
    h('span.st-count', {}, `${max - used}/${max}`));
  const rows = sc.pact
    ? [row(`PACT · ${ORD(sc.pact.level).toUpperCase()}`, sc.pact.count, c.used.pact || 0, (x, v) => { x.used.pact = v; })]
    : sc.slots.map((n, i) => (n ? row(`${ORD(i + 1).toUpperCase()}`, n, c.used.slots[i + 1] || 0, (x, v) => { x.used.slots[i + 1] = v; }) : null)).filter(Boolean);
  if (!rows.length) return null;
  return h('div.slot-tracker', {}, h('div.st-head', {}, h('b', {}, sc.pact ? 'PACT MAGIC SLOTS' : 'SPELL SLOTS'), h('span.muted', {}, ` • reset on ${sc.pact ? 'a Short or Long Rest' : 'a Long Rest'}`)), rows);
}

// ------------------------------------------------------------------ concentration & casting rolls
/** Casting a Concentration spell starts concentrating on it, ending any other. */
function startConcentration(x, sp, at) {
  if (!sp.concentration) return;
  const prev = x.concentration?.spellId;
  if (prev && prev !== sp.id) toast(`Stopped concentrating on ${getSpell(prev)?.name || 'the previous spell'}`);
  x.concentration = { spellId: sp.id, at, since: Date.now() };
}
/** "◆ Concentrating on Bless" with End, under the sheet's header. */
function concBar(c, update) {
  const sp = c.concentration && getSpell(c.concentration.spellId);
  if (!sp) return null;
  return h('div.conc-bar', { role: 'status' }, h('span.conc-gem', { 'aria-hidden': 'true' }, '◆'),
    h('span', {}, 'Concentrating on ', h('b', {}, sp.name), c.concentration.at > sp.level ? ` (level ${c.concentration.at})` : '', sp.duration ? h('small', {}, ` · ${String(sp.duration).replace(/^Concentration,?\s*/i, '')}`) : null),
    h('button.conc-end', { onclick: () => update((x) => { x.concentration = null; }, `Stopped concentrating on ${sp.name}`) }, 'End'));
}
/** After damage while concentrating: CON save, DC 10 or half the damage (whichever is higher, max 30). */
function concentrationCheck(c, d, update, dmg) {
  const sp = getSpell(c.concentration?.spellId); if (!sp) return;
  const dc = Math.min(30, Math.max(10, Math.floor(dmg / 2)));
  const mod = d.saves.con.mod;
  let close;
  const roll = () => {
    const [l, x] = withExhaustion(`Concentration (${sp.name}) CON save`, `1d20${fmt(mod)}`, true);
    const r = rollDice(l, x, { d20: true, adv: netAdv(rollKeys.save('con')) });
    close();
    if (r.total >= dc) toast(`Kept concentration on ${sp.name} (${r.total} vs DC ${dc})`);
    else { update((y) => { y.concentration = null; }, `Lost concentration on ${sp.name}`); toast(`Lost concentration on ${sp.name} (${r.total} vs DC ${dc})`); }
  };
  close = modal('Concentration check', h('div.conc-check', {},
    h('p', {}, `You took ${dmg} damage while concentrating on `, h('b', {}, sp.name), '.'),
    h('p', {}, `Make a Constitution saving throw: `, h('b', {}, `DC ${dc}`), ` (10, or half the damage if that's higher). Your CON save is ${fmt(mod)}.`)),
  [{ label: 'I made it', onClick: () => toast(`Kept concentration on ${sp.name}`) },
    { label: 'I failed', danger: true, onClick: () => { update((y) => { y.concentration = null; }, `Lost concentration on ${sp.name}`); } },
    { label: `Roll CON save ${fmt(mod)}`, primary: true, onClick: () => { roll(); return false; } }]);
}
/** One-click casting: roll the attack, then the damage (dice doubled on a natural 20), and name the save. */
function castRolls(c, d, sp, at, message) {
  if (c.settings.castRolls === false) { if (message) toast(message); return; }
  const cs = casting(d);
  let crit = false;
  if (sp.attack) {
    const [l, x] = withExhaustion(`${sp.name} attack`, `1d20${fmt(cs.attack)}`, true);
    crit = !!rollDice(l, x, { d20: true, adv: netAdv(rollKeys.spell()) }).crit;
  }
  const dmg = spellDamage(sp, c.level, d, at); const dmg2 = spellDamage2(sp, c.level, d, at);
  if (dmg) rollDice(`${sp.name} damage${crit ? ' (critical)' : ''}`, crit ? critDice(dmg.dice) : dmg.dice);
  if (dmg2) rollDice(`${sp.name} (${dmg2.short})`, dmg2.dice);
  const save = spellSave(sp) || dmg2?.save;
  const parts = [message, save && (!sp.attack || dmg2?.save) ? `targets make a DC ${cs.dc} ${save.toUpperCase()} save` : null, sp.concentration ? 'concentrating' : null].filter(Boolean);
  if (parts.length) toast(parts.join(' · '));
}

// ------------------------------------------------------------------ ammunition & consumables
/** Each attack roll with an Ammunition weapon uses one piece (undoable like any change). */
function fireAmmo(c, d, update, a) {
  let left = 0;
  update((x) => { left = spendAmmo(x, d.inventory, a.ammo); }, `Fired ${ammoName(a.ammo).toLowerCase().replace(/s$/, '')} from the ${a.name}`);
  if (left < 0) toast(`No ${ammoName(a.ammo).toLowerCase()} left: add some in the Inventory tab`);
  else if (left <= 3) toast(`${left} ${ammoName(a.ammo).toLowerCase()} left`);
}
/** "Arrows 17", plus Recover after a fight (half of what was fired). */
function ammoChip(c, d, update, kind) {
  const n = ammoCount(d.inventory, kind); const spent = (c.used.ammo || {})[kind] || 0;
  return h('div.ammo-chip', {}, h(`span${n ? '' : '.out'}`, { title: `${ammoName(kind)} in your inventory` }, `${ammoName(kind)}: ${n}`),
    spent ? h('button.ammo-rec', { title: `After the fight, recover half of the ${spent} fired`, onclick: (e) => { e.stopPropagation(); let back = 0; update((x) => { back = recoverAmmo(x, d.inventory, kind); }, `Recovered ${ammoName(kind).toLowerCase()}`); toast(`Recovered ${back} of ${spent} ${ammoName(kind).toLowerCase()}`); } }, `↺ Recover ${Math.floor(spent / 2)}`) : null);
}
/** Use one of a consumable: drink a potion (heals), throw a flask (rolls damage), or just use it up. */
function useItem(c, d, update, e) {
  const k = consumableOf(e.item); if (!k) return;
  const name = e.item.name;
  if (k.kind === 'heal') {
    const r = rollDice(`${name}`, k.dice);
    const max = d.hpMax; const before = c.hp.current ?? max;
    const gain = Math.min(max - before, Math.max(0, r.total));
    update((x) => { x.hp.current = Math.min(max, before + Math.max(0, r.total)); if (x.hp.current > 0) x.deathSaves = { success: 0, fail: 0 }; useOne(x, e.idx); }, `Drank ${name} (+${gain} HP)`);
    toast(`${name}: rolled ${r.total}, healed ${gain}${gain < r.total ? ' (at maximum HP)' : ''}`);
  } else if (k.kind === 'damage') {
    const dc = 8 + d.mods.dex + d.pb;
    rollDice(`${name} damage`, `${k.dice}`);
    update((x) => { useOne(x, e.idx); }, `Threw ${name}`);
    toast(`${name}: target makes a DC ${dc} DEX save or takes ${k.dice} ${k.dtype}${k.note ? ` ${k.note}` : ''}`);
  } else {
    update((x) => { useOne(x, e.idx); }, `Used ${name}`);
    toast(`Used ${name}${e.qty > 1 ? ` (${e.qty - 1} left)` : ''}`);
  }
}

// ------------------------------------------------------------------ actions tab
function attackRows(c, d, update) {
  const sc = casting(d);
  const rows = d.attacks.map((a) => h('tr', {},
    h('td.ico', {}, a.unarmed ? '✊' : a.kind === 'ranged' ? '➶' : '⚔'),
    h('td.nm', {}, h('div', {}, a.name, a.prof ? null : h('span.warn-tag', { title: 'Not proficient: no Proficiency Bonus' }, '!')), h('small', {}, a.unarmed ? 'Melee Attack' : a.pact ? 'Pact Weapon' : `${a.kind === 'ranged' ? 'Ranged' : 'Melee'} Weapon`)),
    h('td.rng', {}, a.range.replace(/ ?ft$/, ' ft.')),
    h('td', {}, rollBtn(`${a.name} attack`, `1d20${fmt(a.bonus)}`, fmt(a.bonus), { d20: true, keys: rollKeys.weapon(), after: a.ammo && update ? () => fireAmmo(c, d, update, a) : null })),
    h('td', {}, dmgCell(a.name, a.damage, a.dtype), a.versatile ? h('div.dmg.alt', { title: 'Two-handed (Versatile)' }, rollBtn(`${a.name} damage (2H)`, a.versatile), h('span.dtype', {}, '2H')) : null),
    h('td.notes', {}, [cap(a.category || ''), ...a.props.filter((p) => p !== 'Range')].filter(Boolean).join(', '),
      a.masteryProp ? [', ', h(`span${a.mastery ? '.mastery' : ''}`, { title: `${a.mastery ? 'Mastery (you can use this): ' : 'Mastery property: '}${WEAPON_MASTERIES[a.masteryProp] || ''}` }, a.masteryProp)] : null,
      a.prop && a.props.includes('Thrown') ? `, Range (${a.prop})` : null,
      a.ammo && update ? ammoChip(c, d, update, a.ammo) : null)));
  for (const { sp, source } of spellEntries(c, d)) {
    const dmg = spellDamage(sp, c.level, d); const save = spellSave(sp);
    if (!dmg || !(sp.attack || save) || timeKind(sp.time) !== 'action') continue;
    rows.push(h('tr.spell', {},
      h('td.ico', {}, '✦'),
      h('td.nm', {}, h('div', {}, h('i', {}, sp.name), sp.concentration ? h('span.conc', { title: 'Concentration' }, ' ◆') : null), h('small', {}, [`${sp.level ? `${ORD(sp.level)} Level` : 'Cantrip'}`, source || 'Spell', sp.concentration ? 'Concentration' : null].filter(Boolean).join(' • '))),
      h('td.rng', {}, rangeAbbr(sp.range)),
      h('td', {}, hitDcCell(sp, sc, save || SECONDARY_DAMAGE[sp.id]?.save)),
      h('td', {}, dmgStack(sp, dmg, spellDamage2(sp, c.level, d))),
      h('td.notes', {}, [durAbbr(sp) ? `D: ${durAbbr(sp)}` : null, compAbbr(sp.components)].filter(Boolean).join(', '))));
  }
  return h('table.ds-attacks', {},
    h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, 'ATTACK'), h('th', {}, 'RANGE'), h('th', {}, 'HIT / DC'), h('th', {}, 'DAMAGE'), h('th', {}, 'NOTES'))),
    h('tbody', {}, rows));
}

function actionsTab(c, d, update, rerender) {
  const spells = spellEntries(c, d);
  const spellsOf = (kind) => spells.filter((e) => timeKind(e.sp.time) === kind);
  const featuresOf = (kind) => d.features.filter((f) => featureKind(f, d) === kind);
  const spellLine = (list) => (list.length ? h('div.act-block', {}, h('h5', {}, 'Spells'),
    h('p.spell-links', {}, list.map((e, i) => [i ? ', ' : '', h('button.linkish.ital', { onclick: () => { view.tab = 'spells'; view.spellQuery = e.sp.name; rerender(); } }, e.sp.name), e.sp.level ? ` (${ORD(e.sp.level)})` : '']))) : null);
  const block = (title, body) => h('div.act-block', {}, h('h5', {}, title), body);
  const section = (key, title, extra, children) => ((view.act === 'all' || view.act === key) ? h('section.act-section', {},
    h('div.act-title', {}, h('span', {}, title), extra ? h('span.muted', {}, ` • ${extra}`) : null), children) : null);
  const lightWeapons = d.attacks.filter((a) => a.props.includes('Light') && a.equipped !== false).length;
  const extraActionsOf = (kind) => d.extraActions.filter((a) => a.kind === kind).map((a) => featureBlock({ name: a.name, desc: a.desc, source: '' }, c, d, update));
  const otherFeatures = d.features.filter((f) => { const k = featureKind(f, d); return k === 'other' || (!k && (isLimited(f, d) || f.extra)); });

  const out = [chips([['all', 'ALL'], ['attack', 'ATTACK'], ['action', 'ACTION'], ['bonus', 'BONUS ACTION'], ['reaction', 'REACTION'], ['other', 'OTHER'], ['limited', 'LIMITED USE']], view.act, (v) => { view.act = v; rerender(); })];
  if (view.act === 'attack') {
    out.push(h('section.act-section', {}, h('div.act-title', {}, h('span', {}, 'ATTACKS'), h('span.muted', {}, ` • Attacks per Action: ${d.attacksPerAction}`)), attackRows(c, d, update)));
    return out;
  }
  out.push(
    section('action', 'ACTIONS', `Attacks per Action: ${d.attacksPerAction}`, [
      attackRows(c, d, update),
      block('Actions in Combat', h('p.combat-list', {}, COMBAT_ACTIONS.map(([n, t], i) => [i ? ', ' : '', h('span.tip', { title: t }, n)]))),
      h('div.act-feature', {}, h('div.af-head', {}, h('b', {}, 'Unarmed Strike')), h('div.af-text', {}, rich(`You make a melee attack that involves using your body to deal one of the following effects:\n\n**Damage.** Make an attack roll; on a hit, you deal ${Math.max(0, 1 + d.mods.str)} Bludgeoning damage (1 + STR).\n\n**Grapple.** The target must succeed on a STR or DEX saving throw (it chooses) against DC ${8 + d.pb + d.mods.str} (8 + PB + STR) or have the Grappled condition.\n\n**Shove.** The target must succeed on a STR or DEX saving throw against DC ${8 + d.pb + d.mods.str} or you push it 5 ft away or knock it Prone.`))),
      spellLine(spellsOf('action').filter((e) => !(spellDamage(e.sp, c.level, d) && (e.sp.attack || spellSave(e.sp))))),
      featuresOf('action').map((f) => featureBlock(f, c, d, update)),
      extraActionsOf('action'),
    ]),
    section('bonus', 'BONUS ACTIONS', null, [
      lightWeapons >= 1 ? block('Actions in Combat', h('p', {}, h('span.tip', { title: 'When you attack with a Light weapon, you can make one extra attack with a different Light weapon as a Bonus Action (no ability modifier to damage unless it’s negative).' }, 'Two-Weapon Fighting'))) : null,
      spellLine(spellsOf('bonus')),
      featuresOf('bonus').map((f) => featureBlock(f, c, d, update)),
      extraActionsOf('bonus'),
      !spellsOf('bonus').length && !featuresOf('bonus').length && !lightWeapons && !d.extraActions.some((a) => a.kind === 'bonus') ? h('p.ds-empty', {}, 'Nothing uses a Bonus Action yet.') : null,
    ]),
    section('reaction', 'REACTIONS', null, [
      block('Actions in Combat', h('p', {}, h('span.tip', { title: 'When a creature you can see leaves your reach, make one melee attack against it.' }, 'Opportunity Attack'))),
      spellLine(spellsOf('reaction')),
      featuresOf('reaction').map((f) => featureBlock(f, c, d, update)),
      extraActionsOf('reaction'),
    ]),
    section('other', 'OTHER', null, [
      block('Actions in Combat', h('p', {}, h('span.tip', { title: 'Once on your turn you can interact with one object or feature (draw a weapon, open a door) as part of your move or action.' }, 'Interact with an Object'))),
      spellLine(spellsOf('other')),
      extraActionsOf('other'),
      otherFeatures.map((f) => featureBlock(f, c, d, update)),

    ]),
    section('limited', 'LIMITED USE', null, [
      slotTracker(c, d, update),
      d.resources.length
        ? d.resources.map((r) => h('div.limited', {}, h('div', {}, h('b', {}, r.name), h('div.muted.tiny', {}, `${resetText(r)}${r.note ? ` · ${r.note}` : ''}`)), usePips(c, r, update)))
        : d.spellcasting ? null : h('p.ds-empty', {}, 'No limited-use features.')]),
  );
  return out;
}

// ------------------------------------------------------------------ spells tab
function spellsTab(c, d, update, rerender) {
  const sc = d.spellcasting; const cs = casting(d);
  const entries = spellEntries(c, d);
  const isWizard = d.cls?.id === 'wizard';
  const book = isWizard ? [...new Set([...(c.spells.spellbook || []), ...c.spells.prepared])] : [];
  const addSpells = h('button.ds-add', { onclick: () => { view.panel = { kind: 'addSpell' }; rerender(); } }, '＋ ADD SPELLS');
  if (!entries.length && !book.length) return [h('div.ds-toolbar', {}, addSpells), h('p.ds-empty', {}, 'No spells yet. Add some here, or ', h('a', { href: `#build-${c.id}-class` }, 'choose them in the builder.'))];

  // Rows: each spell at the level it's cast at, plus (like D&D Beyond) again at each higher slot level when it scales.
  const rows = [];
  for (const e of entries) {
    rows.push({ ...e, at: castLevel(e.sp, d) });
    if (sc && !sc.pact && e.sp.level > 0 && e.sp.higherLevel && !e.free) {
      for (let L = e.sp.level + 1; L <= sc.slots.length; L++) if (sc.slots[L - 1]) rows.push({ ...e, at: L, upcast: true });
    }
  }
  const levels = [...new Set(rows.map((r) => r.at))].sort((a, b) => a - b);
  const q = view.spellQuery.toLowerCase();
  const shown = rows.filter((r) => (view.spellLevel === 'all' || r.at === Number(view.spellLevel))
    && (!q || [r.sp.name, r.sp.time, r.sp.damage, r.sp.school, r.sp.duration, r.source].join(' ').toLowerCase().includes(q)));

  // One click: spend the slot, start concentrating if the spell needs it, and roll the attack and damage.
  const cast = (sp, at) => {
    let castAt = 0;
    update((x) => {
      if (!sc || sp.level === 0) return;
      if (sc.pact) { if ((x.used.pact || 0) < sc.pact.count && sp.level <= sc.pact.level) { x.used.pact = (x.used.pact || 0) + 1; castAt = sc.pact.level; } else toast('No Pact slots left'); }
      else {
        for (let lv = at || sp.level; lv <= sc.slots.length; lv++) if ((x.used.slots[lv] || 0) < sc.slots[lv - 1]) { x.used.slots[lv] = (x.used.slots[lv] || 0) + 1; castAt = lv; break; }
        if (!castAt) toast(`No level ${at || sp.level}+ spell slots left`);
      }
      if (castAt) startConcentration(x, sp, castAt);
    }, `Cast ${sp.name}${at > sp.level ? ` at level ${at}` : ''}`);
    if (castAt) castRolls(c, d, sp, castAt, `Cast ${sp.name} using a level ${castAt}${sc.pact ? ' Pact' : ''} slot`);
  };
  /** Cantrips and free casts: no slot, but the same concentration and rolls. */
  const castFree = (sp, mark) => {
    update((x) => { mark?.(x); startConcentration(x, sp, sp.level); }, `Cast ${sp.name}`);
    castRolls(c, d, sp, sp.level, sp.level ? `Cast ${sp.name} without a slot` : null);
  };
  const slotBoxes = (lv) => {
    if (!sc || lv === 0) return null;
    if (sc.pact) {
      if (lv !== sc.pact.level) return null;
      const used = c.used.pact || 0;
      return h('div.slots', {}, Array.from({ length: sc.pact.count }, (_, i) => h(`button.box${i < used ? '.used' : ''}`, { onclick: () => update((x) => { x.used.pact = i < used ? i : i + 1; }) })), h('span', {}, 'PACT'));
    }
    const max = sc.slots[lv - 1]; if (!max) return null;
    const used = c.used.slots[lv] || 0;
    return h('div.slots', {}, Array.from({ length: max }, (_, i) => h(`button.box${i < used ? '.used' : ''}`, { onclick: () => update((x) => { x.used.slots[lv] = i < used ? i : i + 1; }) })), h('span', {}, 'SLOTS'));
  };
  const prepMax = sc?.preparedMax || 0;
  const unprepare = (id) => update((x) => { x.spells.spellbook = [...new Set([...(x.spells.spellbook || []), id])]; x.spells.prepared = x.spells.prepared.filter((s2) => s2 !== id); });
  const prepare = (id) => update((x) => { if (x.spells.prepared.length >= prepMax) { toast(`You can prepare ${prepMax} spells. Unprepare one first.`); return; } x.spells.prepared = [...x.spells.prepared, id]; });

  const removable = (id) => c.spells.cantrips.includes(id) || c.spells.prepared.includes(id) || (c.spells.spellbook || []).includes(id) || (c.extras?.spells || []).some((x) => x.spellId === id);
  const row = ({ sp, source, free, freePerLongRest, classPrepared, at, upcast }) => {
    const key = `s:${sp.id}:${at}`; const open = view.open.has(key);
    const dmg = spellDamage(sp, c.level, d, at); const save = spellSave(sp);
    const freeKey = `free-${sp.id}`; const freeUsed = (c.used.resources[freeKey] || 0) >= (freePerLongRest || 0);
    const badge = at > sp.level && sp.level > 0 ? h('span.base-lv', {}, ORD(sp.level).toUpperCase()) : null;
    const castCell = sp.level === 0 ? h('button.cast.atwill', { title: c.settings.castRolls === false ? 'At will' : 'Cast (rolls the attack and damage)', onclick: (e) => { e.stopPropagation(); castFree(sp); } }, 'AT', h('br'), 'WILL')
      : freePerLongRest && !upcast ? h(`button.cast.use${freeUsed ? '.used' : ''}`, { title: freeUsed ? 'Free cast used — click to restore (or take a Long Rest)' : `Cast without a slot (${freePerLongRest}/Long Rest)`, onclick: (e) => { e.stopPropagation(); if (freeUsed) update((x) => { x.used.resources[freeKey] = 0; }, `Restored free ${sp.name}`); else castFree(sp, (x) => { x.used.resources[freeKey] = freePerLongRest; }); } }, freeUsed ? 'USED' : 'USE')
        : free ? h('span.atwill', { title: 'Cast without a slot (see the feature that grants it)' }, 'FREE')
          : h('button.cast', { title: at > sp.level ? `${ORD(sp.level)}-level spell, cast with a level ${at} slot` : 'Cast (uses a slot)', onclick: (e) => { e.stopPropagation(); cast(sp, at); } }, badge, 'CAST');
    return [h(`tr.sp-row${open ? '.open' : ''}${upcast ? '.upcast' : ''}`, { onclick: () => { open ? view.open.delete(key) : view.open.add(key); rerender(); } },
      h('td.castc', {}, castCell),
      h('td.nm', {}, h('div', {}, h('i', {}, sp.name), sp.concentration ? h('span.conc', { title: 'Concentration' }, ' ◆') : null, sp.ritual ? h('span.rit', { title: 'Ritual' }, ' Ⓡ') : null), h('small', {}, source || '')),
      h('td', {}, timeAbbr(sp.time)),
      h('td', {}, rangeAbbr(sp.range)),
      h('td', {}, hitDcCell(sp, cs, save || SECONDARY_DAMAGE[sp.id]?.save)),
      h('td', {}, dmg ? dmgStack(sp, dmg, spellDamage2(sp, c.level, d, at)) : effectOf(sp) || h('span.muted', {}, '--')),
      h('td.notes', {}, [freePerLongRest && !upcast ? `${freePerLongRest}/LR` : null, durAbbr(sp) ? `D: ${durAbbr(sp)}` : null, compAbbr(sp.components)].filter(Boolean).join(', '))),
    open ? h('tr.sp-desc', {}, h('td', { colspan: 7 }, rich(sp.desc), sp.higherLevel ? h('p', {}, h('b', {}, 'Using a Higher-Level Spell Slot. '), sp.higherLevel) : null,
      h('p.muted.tiny', {}, `${sp.level ? `${ORD(sp.level)}-level` : 'Cantrip'} ${sp.school} · Casting Time: ${sp.time} · Range: ${sp.range} · Components: ${sp.components} · Duration: ${sp.duration}${source ? ` · Source: ${source}` : ''}`),
      h('div.sp-desc-acts', {},
        isWizard && classPrepared ? h('button.ds-btn', { onclick: (e) => { e.stopPropagation(); unprepare(sp.id); } }, 'Unprepare (keep in spellbook)') : null,
        removable(sp.id) ? h('button.ds-btn.danger', { onclick: (e) => { e.stopPropagation(); update((x) => removeSpell(x, sp.id)); toast(`${sp.name} removed`); } }, isWizard && classPrepared ? 'Remove from spellbook' : 'Remove from sheet') : h('span.muted.tiny', {}, 'Granted by a feature — change it in the builder.')))) : null];
  };
  const byLevel = {}; for (const r of shown) (byLevel[r.at] ||= []).push(r);
  for (const lv of Object.keys(byLevel)) byLevel[lv].sort((a, b) => a.sp.name.localeCompare(b.sp.name));

  // Wizard spellbook: spells you know but haven't prepared.
  const unprepared = book.filter((id) => !c.spells.prepared.includes(id)).map(getSpell).filter(Boolean).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const spellbook = isWizard ? h('section.sp-level.spellbook', {},
    h('div.sp-level-head', {}, h('span', {}, 'SPELLBOOK'), h(c.spells.prepared.length > prepMax ? 'span.prep-over' : 'span.muted', { title: c.spells.prepared.length > prepMax ? `Over the limit: unprepare ${c.spells.prepared.length - prepMax}` : '' }, `Prepared ${c.spells.prepared.length} / ${prepMax}`)),
    unprepared.length
      ? h('table.ds-spells', {}, h('tbody', {}, unprepared.map((sp) => h('tr', {},
        h('td.castc', {}, h('button.cast.prep', { disabled: c.spells.prepared.length >= prepMax, title: c.spells.prepared.length >= prepMax ? 'Unprepare a spell first (open it above)' : 'Prepare this spell', onclick: () => prepare(sp.id) }, 'PREP')),
        h('td.nm', {}, h('div', {}, h('i', {}, sp.name)), h('small', {}, `${ORD(sp.level)} Level • ${sp.school}`)),
        h('td', {}, timeAbbr(sp.time)), h('td', {}, rangeAbbr(sp.range))))))
      : h('p.ds-empty', {}, 'Every spell in your spellbook is prepared. Open a prepared spell to unprepare it.')) : null;

  return [
    h('div.sp-stats', {},
      h('div', {}, h('b', {}, sc ? fmt(d.mods[sc.ability]) : '—'), h('small', {}, 'MODIFIER')),
      h('div', {}, rollBtn('Spell attack', `1d20${fmt(cs.attack)}`, fmt(cs.attack), { d20: true, keys: rollKeys.spell() }), h('small', {}, 'SPELL ATTACK')),
      h('div', {}, h('b', {}, cs.dc), h('small', {}, 'SAVE DC'))),
    slotTracker(c, d, update),
    h('div.ds-toolbar', {}, addSpells, h('label.cast-roll-tog', { title: 'When on, CAST rolls the attack and damage too' }, h('input', { type: 'checkbox', checked: c.settings.castRolls !== false, onchange: (e) => update((x) => { x.settings.castRolls = e.target.checked; }, e.target.checked ? 'Casting rolls dice' : 'Casting doesn’t roll') }), ' Roll when casting'), sc && !isWizard && prepMax ? h('span.muted.tiny', {}, `Prepared ${c.spells.prepared.length} / ${prepMax}`) : null),
    h('input.ds-search', { type: 'search', placeholder: 'Search spell names, casting times, damage types…', value: view.spellQuery,
      oninput: (e) => { view.spellQuery = e.target.value; const pos = e.target.selectionStart; rerender(); const el = document.querySelector('.ds-search'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } } }),
    chips([['all', 'ALL'], ...levels.map((l) => [String(l), l === 0 ? '-0-' : ORD(l).toUpperCase()])], view.spellLevel, (v) => { view.spellLevel = v; rerender(); }),
    Object.keys(byLevel).sort((a, b) => a - b).map((lv) => h('section.sp-level', {},
      h('div.sp-level-head', {}, h('span', {}, Number(lv) === 0 ? 'CANTRIP' : `${ORD(Number(lv)).toUpperCase()} LEVEL`), slotBoxes(Number(lv))),
      h('table.ds-spells', {}, h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, 'NAME'), h('th', {}, 'TIME'), h('th', {}, 'RANGE'), h('th', {}, 'HIT / DC'), h('th', {}, 'EFFECT'), h('th', {}, 'NOTES'))),
        h('tbody', {}, byLevel[lv].map(row))))),
    !shown.length ? h('p.ds-empty', {}, 'No spells match.') : null,
    (() => { // slot levels with no spells listed still get their trackers
      if (!sc || sc.pact || view.spellLevel !== 'all') return null;
      const rest = sc.slots.map((n, i) => (n && !byLevel[i + 1] ? h('span.slotgroup', {}, `${ORD(i + 1)} `, slotBoxes(i + 1)) : null)).filter(Boolean);
      return rest.length ? h('div.sp-level-head.slots-only', {}, h('span', {}, 'OTHER SLOTS'), rest) : null;
    })(),
    view.spellLevel === 'all' && !q ? spellbook : null,
  ];
}

// ------------------------------------------------------------------ features, background, notes
function featuresTab(c, d, update, rerender) {
  const kind = (f) => (f.isFeat ? 'feats' : f.source === d.species?.name ? 'species' : 'class');
  const names = new Set(d.features.map((f) => f.name));
  const childrenOf = (f) => d.features.filter((x) => x.parent && x.parent === f.name);
  const list = d.features.filter((f) => (view.feat === 'all' || kind(f) === view.feat) && !(f.parent && names.has(f.parent)));
  const groups = {}; for (const f of list) (groups[f.source] ||= []).push(f);
  return [
    chips([['all', 'ALL'], ['class', 'CLASS FEATURES'], ['species', 'SPECIES TRAITS'], ['feats', 'FEATS']], view.feat, (v) => { view.feat = v; rerender(); }),
    Object.entries(groups).map(([src, fs]) => h('section.act-section', {}, h('div.act-title', {}, h('span', {}, src.toUpperCase())),
      fs.map((f) => [featureBlock(f, c, d, update), childrenOf(f).length ? h('div.sub-features', {}, childrenOf(f).map((x) => featureBlock(x, c, d, update))) : null]))),
  ];
}

function backgroundTab(c, d) {
  const D = c.details;
  const area = (label, key) => h('div.ds-field', {}, h('h5', {}, label), h('textarea', { rows: 2, oninput: (e) => { D[key] = e.target.value; saveCharacter(c); } }, D[key] || ''));
  const facts = [['Alignment', D.alignment], ['Faith', D.faith], ['Lifestyle', D.lifestyle], ['Gender', D.gender], ['Age', D.age], ['Height', D.height], ['Weight', D.weight], ['Hair', D.hair], ['Eyes', D.eyes], ['Skin', D.skin]].filter(([, v]) => v);
  return [
    h('section.act-section', {}, h('div.act-title', {}, h('span', {}, 'BACKGROUND'), d.bg ? h('span.muted', {}, ` • ${d.bg.name}`) : null),
      d.bg ? rich(d.bg.text || d.bg.desc || '') : h('p.muted', {}, 'No background chosen. ', h('a', { href: `#build-${c.id}-background` }, 'Choose one in the builder.'))),
    facts.length ? h('section.act-section', {}, h('div.act-title', {}, h('span', {}, 'CHARACTERISTICS')), h('div.ds-facts', {}, facts.map(([k, v]) => h('div', {}, h('small', {}, k.toUpperCase()), h('b', {}, v))))) : null,
    h('section.act-section', {}, h('div.act-title', {}, h('span', {}, 'PERSONALITY')), [['Personality Traits', 'personality'], ['Ideals', 'ideals'], ['Bonds', 'bonds'], ['Flaws', 'flaws'], ['Appearance', 'appearance']].map(([l, k]) => area(l, k))),
  ];
}

function notesTab(c) {
  const D = c.details;
  const area = (label, key, rows = 3) => h('div.ds-field', {}, h('h5', {}, label), h('textarea', { rows, oninput: (e) => { D[key] = e.target.value; saveCharacter(c); } }, D[key] || ''));
  return [h('section.act-section', {}, h('div.act-title', {}, h('span', {}, 'NOTES')),
    area('Organizations', 'organizations'), area('Allies', 'allies'), area('Enemies', 'enemies'), area('Backstory', 'backstory', 5), area('Other', 'notes', 6))];
}

function deathSaves(c, update) {
  const pips = (key, label) => h('div.ds-row', {}, h('span', {}, label), [0, 1, 2].map((i) => h(`button.pip${c.deathSaves[key] > i ? '.on' : ''}.${key}`, { onclick: () => update((x) => { x.deathSaves[key] = x.deathSaves[key] > i ? i : i + 1; }) })));
  return h('div.death-saves', {}, h('strong', {}, 'Death Saves'), pips('success', 'Successes'), pips('fail', 'Failures'),
    h('button.btn.small', { onclick: () => {
      const [dl, dx] = withExhaustion('Death Save', '1d20', true); const r = rollDice(dl, dx, { d20: true, adv: netAdv(rollKeys.death()) }); const v = r.parts[0].kept[0];
      update((x) => { if (v === 20) { x.hp.current = 1; x.deathSaves = { success: 0, fail: 0 }; } else if (v === 1) x.deathSaves.fail = Math.min(3, x.deathSaves.fail + 2); else if (v >= 10) x.deathSaves.success = Math.min(3, x.deathSaves.success + 1); else x.deathSaves.fail = Math.min(3, x.deathSaves.fail + 1); });
    } }, 'Roll death save'));
}

function inventoryTab(c, d, update, rerender) {
  const coins = Object.values(c.currency).reduce((a, b) => a + (Number(b) || 0), 0);
  const weight = d.inventory.reduce((s, e) => s + (e.item.weight || 0) * e.qty, 0) + (c.settings.ignoreCoinWeight === false ? coins / 50 : 0);
  // Carrying capacity (2024): STR x 15 lb, halved for Tiny and doubled per size above Medium.
  const capacity = d.scores.str * 15 * ({ Tiny: 0.5, Large: 2, Huge: 4, Gargantuan: 8 }[d.size] || 1);
  const catalog = all('items').sort((a, b) => a.name.localeCompare(b.name));
  const equippable = (it) => it.type === 'armor' || it.type === 'weapon';
  return [
    h('div.currency', {}, ['cp', 'sp', 'ep', 'gp', 'pp'].map((k) => h('label', {}, k.toUpperCase(), h('input.num', { type: 'number', min: 0, value: c.currency[k] || 0, onchange: (e) => update((x) => { x.currency[k] = Math.max(0, Number(e.target.value) || 0); }) })))),
    h('table.inv', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Equip'), h('th', {}, 'Item'), h('th', {}, 'Qty'), h('th', {}, 'Wt'), h('th', {}))),
      h('tbody', {}, d.inventory.map((e) => {
        const i = e.idx;
        return h('tr', {},
          h('td', {}, equippable(e.item) ? h('input', { type: 'checkbox', checked: e.equipped, onchange: () => update((x) => {
            const it = x.inventory[i]; it.equipped = !it.equipped;
            if (it.equipped && e.item.type === 'armor') x.inventory.forEach((o, j) => { const oi = getItem(o.itemId); if (j !== i && oi?.type === 'armor' && (oi.armorType === 'shield') === (e.item.armorType === 'shield')) o.equipped = false; });
          }) }) : null),
          h('td', {}, h('details', {}, h('summary', {}, e.item.name,
            e.item.type === 'weapon' && e.item.kind === 'melee' && (d.cls?.id === 'warlock' || e.pact) ? h(`button.pact-tog${e.pact ? '.on' : ''}`, { title: 'Pact of the Blade: proficient, and can use CHA for attack and damage', onclick: (ev) => { ev.preventDefault(); update((x) => { x.inventory[i].pact = !x.inventory[i].pact; }); } }, e.pact ? 'Pact weapon' : 'Make pact weapon') : null),
            h('p.muted.tiny', {}, itemDesc(e.item)), e.notes ? h('p.tiny', {}, e.notes) : null)),
          h('td', {}, h('div.stepper.small', {}, h('button', { onclick: () => update((x) => { x.inventory[i].qty = Math.max(0, x.inventory[i].qty - 1); if (!x.inventory[i].qty) x.inventory.splice(i, 1); }) }, '−'), h('span', {}, e.qty), h('button', { onclick: () => update((x) => { x.inventory[i].qty++; }) }, '+'))),
          h('td.muted', {}, e.item.weight ? +(e.item.weight * e.qty).toFixed(2) : '—'),
          h('td.inv-acts', {},
            consumableOf(e.item) && e.qty > 0 ? h('button.use-btn', { title: { heal: `Drink: regain ${consumableOf(e.item).dice} HP`, damage: `Throw: ${consumableOf(e.item).dice} ${consumableOf(e.item).dtype}` }[consumableOf(e.item).kind] || 'Use one', onclick: () => useItem(c, d, update, e) }, consumableOf(e.item).kind === 'heal' ? 'DRINK' : consumableOf(e.item).kind === 'damage' ? 'THROW' : 'USE') : null,
            ammoKindOfItem(e.item) && (c.used.ammo || {})[ammoKindOfItem(e.item)] ? ammoChip(c, d, update, ammoKindOfItem(e.item)).lastChild : null,
            h('button.icon-btn', { title: 'Edit', onclick: () => { view.panel = { kind: 'editItem', arg: i }; rerender(); } }, '✎'), h('button.icon-btn', { title: 'Remove', onclick: () => update((x) => { x.inventory.splice(i, 1); }) }, '✕')));
      }))),
    h('p.muted.tiny', {}, c.settings.encumbrance === 'none' ? `Carrying ${+weight.toFixed(1)} lb.` : `Carrying ${+weight.toFixed(1)} lb of ${capacity} lb capacity.`),
    c.otherPossessions ? h('p.tiny', {}, h('b', {}, 'Other possessions: '), c.otherPossessions) : null,
    h('div.ds-toolbar', {}, h('button.ds-add', { onclick: () => { view.panel = { kind: 'addItem' }; rerender(); } }, '＋ ADD ITEMS'), h('button.ds-add', { onclick: () => { view.panel = { kind: 'addItem', tab: 'custom' }; rerender(); } }, '＋ CUSTOM ITEM')),
  ];
}
const itemDesc = (it) => it.type === 'weapon' ? `${cap(it.category)} ${it.kind} weapon · ${it.damage} ${it.dtype} · ${(it.props || []).join(', ') || 'no properties'}${it.range ? ` · ${it.range} ft` : ''}${it.mastery ? ` · Mastery: ${it.mastery}` : ''}${it.desc ? ` · ${it.desc}` : ''}`
  : it.type === 'armor' ? `${cap(it.armorType)} armor · AC ${it.armorType === 'shield' ? '+2' : it.ac}${it.armorType === 'light' ? ' + DEX' : it.armorType === 'medium' ? ' + DEX (max 2)' : ''}${it.strReq ? ` · STR ${it.strReq}` : ''}${it.stealthDis ? ' · Stealth Disadvantage' : ''}`
    : it.type === 'magic-item' ? `${it.subtitle || it.category || 'Magic item'} · ${it.rarity}${it.attunement ? ' · requires attunement' : ''}. ${it.desc}` : it.desc || '';

function conditionsDialog(c, update) {
  // Edit a copy and apply it on Done, so the whole change is one Undo step.
  let conds = [...c.conditions]; let ex = c.exhaustion;
  const body = h('div.cond-list', {}, CONDITIONS.filter((x) => x.id !== 'exhaustion').map((cond) => h('label.cond', {},
    h('input', { type: 'checkbox', checked: conds.includes(cond.id), onchange: (e) => { conds = e.target.checked ? [...conds, cond.id] : conds.filter((x) => x !== cond.id); } }),
    h('div', {}, h('b', {}, cond.name), h('div.muted.tiny', {}, cond.desc)))),
  h('label.cond', {}, h('div', {}, h('b', {}, 'Exhaustion level'), h('div.muted.tiny', {}, CONDITIONS.find((x) => x.id === 'exhaustion').desc)),
    h('input.num', { type: 'number', min: 0, max: 6, value: ex, onchange: (e) => { ex = Math.max(0, Math.min(6, Number(e.target.value) || 0)); } })));
  modal('Conditions', body, [{ label: 'Done', primary: true, onClick: () => update((x) => { x.conditions = conds; x.exhaustion = ex; }) }]);
}

function shortRest(c, d, update) {
  const avail = c.level - (c.used.hitDice || 0);
  const body = h('div', {}, h('p', {}, `Spend Hit Dice to heal. Each die is 1d${d.hitDie} + CON (${fmt(d.mods.con)}). Available: ${avail}.`),
    h('button.btn', { disabled: avail <= 0, onclick: () => {
      const r = rollDice('Hit Die', `1d${d.hitDie}${fmt(d.mods.con)}`);
      update((x) => { x.used.hitDice = (x.used.hitDice || 0) + 1; x.hp.current = Math.min(d.hpMax, (x.hp.current ?? d.hpMax) + Math.max(0, r.total)); });
      closeIt(); shortRest(c, compute(c), update);
    } }, `Roll a Hit Die`));
  const closeIt = modal('Short Rest', body, [{ label: 'Cancel' }, { label: 'Finish Short Rest', primary: true, onClick: () => update((x) => {
    for (const r of d.resources) if (r.reset === 'short') x.used.resources[r.id] = 0;
    for (const id of ['rage', 'channel-divinity', 'wild-shape', 'second-wind']) if (x.used.resources[id]) x.used.resources[id] -= 1;
    if (d.cls?.id === 'bard' && c.level >= 5) x.used.resources['bardic-inspiration'] = 0;
    x.used.pact = 0; toast('Short Rest complete');
  }) }]);
}

function longRest(x, d) {
  x.hp.current = d.hpMax; x.hp.temp = 0; x.used.slots = {}; x.used.pact = 0; x.used.resources = {};
  x.used.hitDice = 0; // 2024 rules: a Long Rest restores all spent Hit Point Dice (2014 restored half)
  x.deathSaves = { success: 0, fail: 0 }; x.exhaustion = Math.max(0, (x.exhaustion || 0) - 1);
  x.concentration = null; // you sleep through a Long Rest, which ends Concentration
  if (x.speciesId === 'human') x.heroicInspiration = true;
  toast('Long Rest complete: HP, Hit Dice, slots and features restored');
}

function exportDialog(c) {
  const json = exportCharacter(c);
  modal('Export character', h('div', {}, h('p.muted', {}, 'Your character as JSON. Import it on another device from My Characters → Import.'), h('textarea.code', { rows: 12, readonly: true }, json)), [
    { label: 'Download .json', onClick: () => { downloadText(`${(c.name || 'character').replace(/\W+/g, '-')}.json`, json); return false; } },
    { label: 'Copy JSON', primary: true, onClick: () => { copyText(json); return false; } },
  ]);
}
