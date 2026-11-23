// Shared builder widgets: chip pickers, feat-choice editors, spell pickers.
import { h, cap, explain, rich } from './dom.js';
import { ABILITIES, SKILLS, all, getFeat, getSpell, spellsFor } from '../data/index.js';

export const abilityName = (id) => ABILITIES.find((a) => a.id === id)?.name || id;
export const skillName = (id) => SKILLS.find((s) => s.id === id)?.name || id;

/** Multi-select chips with a maximum. */
export function chips({ options, selected = [], max = Infinity, locked = [], onChange }) {
  const sel = new Set(selected);
  return h('div.chips', {}, options.map((o) => {
    const isLocked = locked.includes(o.id);
    const on = sel.has(o.id) || isLocked;
    const disabled = isLocked || (!on && sel.size >= max);
    return h(`button.chip${on ? '.on' : ''}`, {
      type: 'button', disabled, title: isLocked ? 'Already granted from another source' : o.title || '',
      onclick: () => { on ? sel.delete(o.id) : sel.add(o.id); onChange([...sel]); },
    }, on ? '✓ ' : '', o.label);
  }));
}

export function counter(n, max) {
  return h(`span.counter${n >= max ? '.done' : ''}`, {}, `${n} / ${max}`);
}

export function select({ value, options, placeholder = 'Choose…', onChange }) {
  return h('select', { onchange: (e) => onChange(e.target.value || null) },
    h('option', { value: '' }, placeholder),
    options.map((o) => h('option', { value: o.id, selected: o.id === value }, o.label)));
}

/** Radio-style option cards (used for subclasses, Divine Order, lineages…). */
export function optionCards({ options, value, onChange }) {
  return h('div.option-cards', {}, options.map((o) => h(`button.option-card${o.id === value ? '.on' : ''}`, { type: 'button', onclick: () => onChange(o.id) },
    h('strong', {}, o.name), o.desc ? h('span', {}, o.desc) : null, o.source && o.source !== 'SRD' ? h('em.src', {}, o.source) : null)));
}

export function spellLine(sp, extra) {
  return h('details.spell-line', {},
    h('summary', {}, h('span.sp-name', {}, sp.name), h('span.sp-meta', {}, `${sp.level ? `Lv ${sp.level}` : 'Cantrip'} · ${sp.school}${sp.concentration ? ' · C' : ''}${sp.ritual ? ' · R' : ''}`),
      sp.source && sp.source !== 'SRD' && !extra?.classList?.contains('src') ? h('em.src', {}, sp.source) : null, extra || null),
    h('div.sp-body', {},
      h('div.sp-grid', {}, h('span', {}, h('b', {}, 'Casting time '), sp.time), h('span', {}, h('b', {}, 'Range '), sp.range), h('span', {}, h('b', {}, 'Components '), sp.components), h('span', {}, h('b', {}, 'Duration '), sp.duration)),
      rich(sp.desc), sp.higherLevel ? h('p', {}, h('b', {}, 'Using a Higher-Level Spell Slot. '), sp.higherLevel) : null,
      h('p.muted.tiny', {}, `Classes: ${sp.classes.map(cap).join(', ')}${sp.source && sp.source !== 'SRD' ? ` · Source: ${sp.source}` : ''}`)));
}

/** Pick N spells from a list, e.g. Magic Initiate cantrips. */
export function spellPicker({ list, level, selected = [], max, onChange }) {
  const pool = spellsFor(list).filter((s) => (level === 0 ? s.level === 0 : s.level === level));
  const sel = new Set(selected);
  return spellListBox(pool.map((sp) => {
    const on = sel.has(sp.id);
    const box = h('input', { type: 'checkbox', checked: on, disabled: !on && sel.size >= max,
      onclick: (e) => e.stopPropagation(),
      onchange: () => { on ? sel.delete(sp.id) : sel.add(sp.id); onChange([...sel]); } });
    return spellLine(sp, h('label.pick', { onclick: (e) => e.stopPropagation() }, box));
  }), pool);
}

/** Scrollable spell list with a search box and level headings. */
export function spellListBox(lines, spells) {
  const groups = h('div.spell-pick');
  let lastLevel = null;
  lines.forEach((line, i) => {
    const sp = spells[i];
    if (sp.level !== lastLevel && new Set(spells.map((x) => x.level)).size > 1) { groups.append(h('div.spell-lvl-head', {}, sp.level ? `Level ${sp.level}` : 'Cantrips')); lastLevel = sp.level; }
    line.dataset.name = `${sp.name} ${sp.school}`.toLowerCase();
    groups.append(line);
  });
  if (spells.length < 12) return groups;
  const search = h('input.search.small', { type: 'search', placeholder: `Search ${spells.length} spells…`, oninput: (e) => {
    const q = e.target.value.toLowerCase();
    groups.querySelectorAll('details.spell-line').forEach((d) => { d.style.display = d.dataset.name.includes(q) ? '' : 'none'; });
    groups.querySelectorAll('.spell-lvl-head').forEach((hd) => {
      let n = hd.nextElementSibling; let any = false;
      while (n && !n.classList.contains('spell-lvl-head')) { if (n.style.display !== 'none') any = true; n = n.nextElementSibling; }
      hd.style.display = any ? '' : 'none';
    });
  } });
  return h('div.spell-box', {}, search, groups);
}

/**
 * Renders the extra choices a feat needs (spells, skills, ability increases).
 * `ch` is the stored choice object, `set(patch)` merges into it.
 */
export function featChoices(feat, ch, set, { fixedList } = {}) {
  if (!feat?.choices?.length) return null;
  const rows = [];
  for (const def of feat.choices) {
    if (def.type === 'spell-list') {
      const list = fixedList || ch.list;
      rows.push(h('div.field', {}, h('label', {}, 'Spell list'), fixedList ? h('span.pill', {}, cap(fixedList))
        : select({ value: ch.list, options: def.options.map((o) => ({ id: o, label: cap(o) })), onChange: (v) => set({ list: v, cantrips: [], spell: [] }) })));
      ch._list = list;
    }
    if (def.type === 'cantrip' && (fixedList || ch.list)) rows.push(h('div.field', {}, h('label', {}, 'Cantrips ', counter((ch.cantrips || []).length, def.count)),
      spellPicker({ list: fixedList || ch.list, level: 0, selected: ch.cantrips, max: def.count, onChange: (v) => set({ cantrips: v }) })));
    if (def.type === 'spell' && (fixedList || ch.list)) rows.push(h('div.field', {}, h('label', {}, `Level ${def.level} spell `, counter((ch.spell || []).length, def.count)),
      spellPicker({ list: fixedList || ch.list, level: def.level, selected: ch.spell, max: def.count, onChange: (v) => set({ spell: v }) })));
    if (def.type === 'ability') rows.push(h('div.field', {}, h('label', {}, 'Spellcasting ability'),
      select({ value: ch.ability, options: def.options.map((o) => ({ id: o, label: abilityName(o) })), onChange: (v) => set({ ability: v }) })));
    if (def.type === 'skill') rows.push(h('div.field', {}, h('label', {}, 'Skills ', counter((ch.skills || []).length, def.count)),
      chips({ options: SKILLS.map((s) => ({ id: s.id, label: s.name })), selected: ch.skills, max: def.count, onChange: (v) => set({ skills: v }) })));
    if (def.type === 'ability-plus1') {
      const opts = def.options === 'any' ? ABILITIES.map((a) => a.id) : def.options;
      rows.push(h('div.field', {}, h('label', {}, '+1 to'), select({ value: ch.ability, options: opts.map((o) => ({ id: o, label: abilityName(o) })), onChange: (v) => set({ ability: v }) })));
    }
    if (def.type === 'asi') {
      const asi = ch.asi || { mode: 'single' };
      const abil = ABILITIES.map((a) => ({ id: a.id, label: a.name }));
      rows.push(h('div.field', {}, h('label', {}, 'Increase'),
        h('div.seg', {},
          h(`button${asi.mode === 'single' ? '.on' : ''}`, { type: 'button', onclick: () => set({ asi: { mode: 'single', a: asi.a } }) }, '+2 to one'),
          h(`button${asi.mode === 'double' ? '.on' : ''}`, { type: 'button', onclick: () => set({ asi: { mode: 'double', a: asi.a } }) }, '+1 to two')),
        h('div.row', {}, select({ value: asi.a, options: abil, onChange: (v) => set({ asi: { ...asi, a: v } }) }),
          asi.mode === 'double' ? select({ value: asi.b, options: abil.filter((x) => x.id !== asi.a), onChange: (v) => set({ asi: { ...asi, b: v } }) }) : null)));
    }
  }
  return h('div.feat-choices', {}, rows);
}

/** Feat selector + its choices, for a given slot. */
export function featSlot({ label, categories, value, choices, onFeat, onChoices, explainText }) {
  const options = all('feats').filter((f) => categories.includes(f.category)).map((f) => ({ id: f.id, label: f.name + (f.source !== 'SRD' ? ` (${f.source})` : '') }));
  const feat = getFeat(value);
  return h('div.feat-slot', {},
    h('div.field', {}, h('label', {}, label), select({ value, options, placeholder: 'Choose a feat…', onChange: onFeat })),
    feat ? rich(feat.text || feat.desc) : explainText ? h('p.muted', {}, explainText) : null,
    feat ? featChoices(feat, choices || {}, onChoices) : null);
}

export { getSpell };
