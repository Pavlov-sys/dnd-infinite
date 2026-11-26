// Level-up wizard: what the next level brings, Hit Points (average or rolled), then any new
// choices. Each level-up saves a snapshot of the character so it can be rolled back later.
import { h, modal, toast } from './dom.js';
import { compute, XP_TABLE, featSlots } from '../engine/rules.js';
import { todos, STEPS } from './builder.js';
import { rollDice } from './dicelog.js';
import { icon } from './icons.js';

const HISTORY = 5; // level-ups kept for rolling back
const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** Preview the character one level up (pure: does not change `c`). */
export function previewLevelUp(c, hpRoll = null) {
  const next = structuredClone(c);
  applyLevel(next, hpRoll);
  return next;
}

/** Raise the level on `x` (mutates). hpRoll: a die result, or null for the average. */
export function applyLevel(x, hpRoll) {
  const to = x.level + 1;
  x.hpRolls = { ...(x.hpRolls || {}) };
  if (hpRoll != null) { x.settings = { ...x.settings, hpType: 'manual' }; x.hpRolls[to] = hpRoll; } else delete x.hpRolls[to];
  if (x.settings?.advancement === 'xp') x.xp = Math.max(x.xp || 0, XP_TABLE[to - 1] || 0);
  x.level = to;
}

/** Everything that changes between two computed characters, for the summary screen. */
export function levelChanges(d0, d1) {
  const key = (f) => `${f.source || ''}|${f.name}`;
  const had = new Set(d0.features.map(key));
  const features = d1.features.filter((f) => !had.has(key(f)) && !f.parent);
  const changes = [];
  const newFeats = featSlots(d1.cls, d1.level).length - featSlots(d0.cls, d0.level).length;
  if (newFeats > 0) changes.push(['Feat', 'Choose a feat: Ability Score Improvement (+2 to one score or +1 to two) or another feat you qualify for']);
  if (d1.pb !== d0.pb) changes.push(['Proficiency Bonus', `${fmt(d0.pb)} → ${fmt(d1.pb)}`]);
  if (d1.attacksPerAction !== d0.attacksPerAction) changes.push(['Attacks per Attack action', `${d0.attacksPerAction} → ${d1.attacksPerAction}`]);
  const s0 = d0.spellcasting, s1 = d1.spellcasting;
  if (s1) {
    const slots0 = s0?.slots || [], slots1 = s1.slots || [];
    const slotTxt = slots1.map((n, i) => (n !== (slots0[i] || 0) ? `${ORD[i + 1]}: ${slots0[i] || 0} → ${n}` : null)).filter(Boolean);
    if (slotTxt.length) changes.push(['Spell slots', slotTxt.join(', ')]);
    if (s1.pact && JSON.stringify(s1.pact) !== JSON.stringify(s0?.pact)) changes.push(['Pact Magic', `${s1.pact.count ?? s1.pact.slots} slot(s) of ${ORD[s1.pact.level] || s1.pact.level} level`]);
    if (s1.cantripsMax !== (s0?.cantripsMax || 0)) changes.push(['Cantrips known', `${s0?.cantripsMax || 0} → ${s1.cantripsMax}`]);
    if (s1.preparedMax !== (s0?.preparedMax || 0)) changes.push(['Prepared spells', `${s0?.preparedMax || 0} → ${s1.preparedMax}`]);
    if (s1.maxSpellLevel !== (s0?.maxSpellLevel || 0)) changes.push(['Highest spell level', `${ORD[s0?.maxSpellLevel] || 'none'} → ${ORD[s1.maxSpellLevel]}`]);
  }
  const r0 = Object.fromEntries((d0.resources || []).map((r) => [r.id, r]));
  for (const r of d1.resources || []) {
    const before = r0[r.id];
    if (!before) changes.push([r.name, `new: ${r.max} use${r.max === 1 ? '' : 's'}`]);
    else if (before.max !== r.max) changes.push([r.name, `${before.max} → ${r.max} uses`]);
  }
  return { features, changes };
}

/** The new things to choose after levelling, each with the builder step that handles it. */
export function newChoices(c0, d0, c1, d1) {
  const t0 = todos(c0, d0), t1 = todos(c1, d1);
  const out = [];
  for (const s of Object.keys(t1)) for (const m of t1[s]) if (!t0[s].includes(m)) out.push({ step: s, text: m });
  return out;
}

/** Roll back the most recent level-up. */
export function rollBack(c) {
  const hist = c.levelHistory || [];
  const last = hist[hist.length - 1]; if (!last) return false;
  const snap = structuredClone(last.snapshot);
  for (const k of Object.keys(c)) delete c[k];
  Object.assign(c, snap, { levelHistory: hist.slice(0, -1) });
  return true;
}

/**
 * Open the wizard. `update(fn, label)` is the sheet's undoable change function; `go(hash)`
 * navigates; `onDone` re-renders the sheet.
 */
export function levelUpWizard(c, update, go) {
  if (c.level >= 20) { toast('Already level 20, the highest level.'); return; }
  const d0 = compute(c);
  const to = c.level + 1;
  const hd = d0.hitDie; const avg = hd / 2 + 1; const con = d0.mods.con;
  let hpRoll = null; // null = average
  const body = h('div.lvlup');
  const show = (...kids) => body.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  let close = null;

  const header = (step) => h('div.lu-steps', {}, ['What’s new', 'Hit Points', 'Choices'].map((t, i) => h(`span${i === step ? '.on' : i < step ? '.done' : ''}`, {}, `${i + 1}. ${t}`)));
  const nav = (...btns) => h('div.lu-nav', {}, ...btns);

  // 1. What the level brings.
  const stepNew = () => {
    const d1 = compute(previewLevelUp(c, null));
    const { features, changes } = levelChanges(d0, d1);
    const sub = d0.cls && to === d0.cls.subclassLevel && !d0.sub;
    show(header(0),
      h('div.lu-hero', {}, h('div.lu-badge', {}, h('small', {}, 'LEVEL'), h('b', {}, `${to}`)),
        h('div', {}, h('h4', {}, `${c.name || 'Your character'} reaches ${d0.cls?.name || ''} level ${to}`), h('p.muted', {}, `Hit Points go up by 1d${hd} ${fmt(con)} (or ${Math.max(1, avg + con)} on average). You'll choose next.`))),
      features.length ? h('div.lu-sec', {}, h('h5', {}, 'New features'),
        features.map((f) => h('details.lu-feat', {}, h('summary', {}, h('b', {}, f.name), f.source ? h('span.lu-src', {}, f.source) : null, f.desc ? h('span.lu-desc', {}, f.desc) : null),
          f.text ? h('div.lu-text', {}, f.text) : null))) : null,
      sub ? h('div.lu-sec', {}, h('h5', {}, 'Subclass'), h('p', {}, `Level ${to} is when a ${d0.cls.name} chooses a subclass. You'll pick it after this.`)) : null,
      changes.length ? h('div.lu-sec', {}, h('h5', {}, 'Improvements'), h('table.lu-table', {}, changes.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))) : null,
      !features.length && !changes.length && !sub ? h('p.muted', {}, 'This level brings more Hit Points. Any choices are on the last step.') : null,
      (c.levelHistory || []).length ? h('p.lu-rollback', {}, `Changed your mind about level ${c.level}? `, h('button.linkish', { onclick: () => confirmRollback() }, `Roll back to level ${c.levelHistory[c.levelHistory.length - 1].from}`)) : null,
      nav(h('button.btn', { onclick: () => close() }, 'Cancel'), h('button.btn.primary', { onclick: stepHp }, 'Next: Hit Points ›')));
  };

  // 2. Hit Points: take the average or roll.
  const stepHp = () => {
    const gain = (r) => Math.max(1, (r ?? avg) + con);
    const rolled = hpRoll != null;
    const opt = (on, title, big, sub, onclick) => h(`button.lu-hp${on ? '.on' : ''}`, { onclick }, h('small', {}, title), h('b', {}, big), h('span', {}, sub));
    show(header(1),
      h('p', {}, `Each level adds your Hit Die (d${hd}) plus your Constitution modifier (${fmt(con)}). Take the fixed average, or roll and live with the result.`),
      h('div.lu-hp-opts', {},
        opt(!rolled, 'TAKE THE AVERAGE', `+${gain(null)}`, `${avg} ${fmt(con)} CON`, () => { hpRoll = null; stepHp(); }),
        opt(rolled, rolled ? 'ROLLED' : 'ROLL THE DIE', rolled ? `+${gain(hpRoll)}` : `1d${hd}`, rolled ? `${hpRoll} on the d${hd} ${fmt(con)} CON` : 'Click to roll', () => {
          const r = rollDice(`Level ${to} Hit Points`, `1d${hd}`); hpRoll = r.total; stepHp();
        })),
      rolled ? h('p.muted.tiny', {}, 'Rolling switches this character to rolled Hit Points; earlier levels keep the average unless you change them in the builder settings.') : null,
      h('p.lu-total', {}, `Max HP: ${d0.hpMax} → `, h('b', {}, `${compute(previewLevelUp(c, hpRoll)).hpMax}`)),
      nav(h('button.btn', { onclick: stepNew }, '‹ Back'), h('button.btn.primary', { onclick: finish }, icon('levelup'), `Level up to ${to}`)));
  };

  // 3. Apply, then show anything left to choose.
  const finish = () => {
    const before = structuredClone(c); const dBefore = d0;
    const gainHp = compute(previewLevelUp(c, hpRoll)).hpMax - d0.hpMax;
    update((x) => {
      const snapshot = structuredClone(x); delete snapshot.levelHistory;
      x.levelHistory = [...(x.levelHistory || []), { from: x.level, to, at: Date.now(), snapshot }].slice(-HISTORY);
      applyLevel(x, hpRoll);
      if (x.hp.current != null) x.hp.current += Math.max(0, gainHp); // the new Hit Points arrive unhurt
    }, `Level up to ${to}`);
    const choices = newChoices(before, dBefore, c, compute(c));
    if (!choices.length) { close(); toast(`${c.name || 'Character'} is now level ${to}!`); return; }
    const label = (s) => STEPS.find((x) => x.id === s)?.short || s;
    show(header(2),
      h('div.lu-hero', {}, h('div.lu-badge.done', {}, h('small', {}, 'LEVEL'), h('b', {}, `${to}`)), h('div', {}, h('h4', {}, `Level ${to}! Now make your new choices`), h('p.muted', {}, `Hit Points +${gainHp}. These choices are made in the builder; the sheet keeps reminding you until they're done.`))),
      h('ul.lu-choices', {}, choices.map((ch) => h('li', {}, h('span', {}, ch.text), h('a.btn.small', { href: `#build-${c.id}-${ch.step}`, onclick: () => close() }, `Choose in ${label(ch.step)} ›`)))),
      nav(h('button.btn', { onclick: () => close() }, 'Later'), h('a.btn.primary', { href: `#build-${c.id}-${choices[0].step}`, onclick: () => close() }, 'Start choosing ›')));
  };

  const confirmRollback = () => {
    const last = c.levelHistory[c.levelHistory.length - 1];
    show(h('div.lu-sec', {}, h('h5', {}, `Roll back to level ${last.from}?`),
      h('p', {}, `This returns ${c.name || 'the character'} to exactly how they were just before levelling up on ${new Date(last.at).toLocaleDateString()}. Anything changed since then (HP, spells, items, notes) goes back too.`)),
    nav(h('button.btn', { onclick: stepNew }, 'Cancel'), h('button.btn.danger', { onclick: () => { update((x) => { rollBack(x); }, `Roll back to level ${last.from}`); close(); toast(`Back to level ${last.from}`); } }, `Roll back to level ${last.from}`)));
  };

  stepNew();
  close = modal(`Level Up`, body, []);
}
