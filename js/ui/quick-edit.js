// Quick edits from the character sheet, shown in a side panel that is part of the sheet (same frames,
// colours and theme): adjust any number, set proficiency, add advantage/disadvantage, add or remove
// spells and prepared spells, and add, create or edit items.
import { h, cap, toast } from './dom.js';
import { ABILITIES, SKILLS, all, getSpell, getItem } from '../data/index.js';
import { fmt, ADV_TARGETS } from '../engine/rules.js';

const ORD = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const ensure = (x) => { x.custom ||= {}; x.custom.prof ||= {}; x.custom.bonus ||= {}; x.custom.override ||= {}; x.custom.adv ||= []; return x.custom; };
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/** Remove a spell from wherever the character has it (not from feat choices, which are edited in the builder). */
export function removeSpell(x, id) {
  x.spells.cantrips = x.spells.cantrips.filter((s) => s !== id);
  x.spells.prepared = x.spells.prepared.filter((s) => s !== id);
  x.spells.spellbook = (x.spells.spellbook || []).filter((s) => s !== id);
  if (x.extras) x.extras.spells = (x.extras.spells || []).filter((s) => s.spellId !== id);
}

/** The side panel for view.panel = { kind, arg, ... }. */
export function quickPanel(c, d, update, view, rerender) {
  const p = view.panel; if (!p) return null;
  const close = () => { view.panel = null; rerender(); };
  const titles = { adjust: `Adjust ${{ saves: 'Saving Throws', skills: 'Skills', combat: 'Combat & Senses' }[p.arg] || ''}`, adv: 'Advantage & Disadvantage', addSpell: 'Add Spells', addItem: 'Add Items', editItem: 'Edit Item' };
  const body = { adjust: adjustPanel, adv: advPanel, addSpell: spellPanel, addItem: itemPanel, editItem: editItemPanel }[p.kind];
  return h('aside.ds-side.ds-frame', { onclick: (e) => e.stopPropagation() },
    h('div.side-head', {}, h('h3', {}, titles[p.kind] || 'Adjust'), h('button.side-x', { title: 'Close', onclick: close }, '✕')),
    h('div.side-body', {}, body ? body(c, d, update, view, rerender) : null));
}

// ------------------------------------------------------------------ numbers & proficiency
function adjustRow(c, update, key, label, current, { profOptions, profKey } = {}) {
  const cu = c.custom || {};
  const b = cu.bonus?.[key] ?? ''; const o = cu.override?.[key] ?? ''; const pr = profKey ? cu.prof?.[profKey] ?? '' : null;
  const changed = b !== '' && b !== 0 || o !== '' || (pr !== null && pr !== '');
  return h(`div.adj-row${changed ? '.changed' : ''}`, {},
    h('div.adj-name', {}, h('b', {}, label), h('span.adj-now', {}, current)),
    profOptions ? h('select.adj-prof', { 'data-k': `p-${key}`, title: 'Proficiency', onchange: (e) => update((x) => { const cx = ensure(x); if (e.target.value) cx.prof[profKey] = e.target.value; else delete cx.prof[profKey]; }) },
      profOptions.map(([v, l]) => h('option', { value: v, selected: v === pr }, l))) : h('span'),
    h('label.adj-in', { title: 'Added to the calculated value' }, h('small', {}, 'BONUS'), h('input', { 'data-k': `b-${key}`, type: 'number', value: b, placeholder: '0', onchange: (e) => update((x) => { const cx = ensure(x); const v = num(e.target.value); if (v) cx.bonus[key] = v; else delete cx.bonus[key]; }) })),
    h('label.adj-in', { title: 'Replaces the calculated value. Leave blank to calculate it.' }, h('small', {}, 'SET TO'), h('input', { 'data-k': `o-${key}`, type: 'number', value: o, placeholder: 'auto', onchange: (e) => update((x) => { const cx = ensure(x); const v = num(e.target.value); if (v === null) delete cx.override[key]; else cx.override[key] = v; }) })),
    h('button.adj-reset', { title: 'Reset to calculated', disabled: !changed, onclick: () => update((x) => { const cx = ensure(x); delete cx.bonus[key]; delete cx.override[key]; if (profKey) delete cx.prof[profKey]; }) }, '↺'));
}

function adjustPanel(c, d, update, view, rerender) {
  const section = view.panel.arg;
  const tabs = h('div.ds-chips', {}, [['combat', 'COMBAT & SENSES'], ['saves', 'SAVES'], ['skills', 'SKILLS']].map(([id, l]) => h(`button${section === id ? '.on' : ''}`, { onclick: () => { view.panel.arg = id; rerender(); } }, l)));
  const help = h('p.side-help', {}, 'Bonus is added to what the sheet calculates; Set to replaces it. Changed values are marked on the sheet with an accent dot.');
  let rows = [];
  if (section === 'saves') {
    rows = ABILITIES.map((a) => adjustRow(c, update, `save:${a.id}`, `${a.name}`, fmt(d.saves[a.id].mod), { profKey: `save:${a.id}`, profOptions: [['', 'Auto'], ['prof', 'Proficient'], ['none', 'Not proficient']] }));
    rows.push(h('button.side-link', { onclick: () => { view.panel = { kind: 'adv' }; rerender(); } }, '＋ Advantage or disadvantage on saves…'));
  } else if (section === 'skills') {
    rows = SKILLS.map((s) => adjustRow(c, update, `skill:${s.id}`, s.name, fmt(d.skills[s.id].mod), { profKey: `skill:${s.id}`, profOptions: [['', 'Auto'], ['none', 'None'], ['half', 'Half'], ['prof', 'Proficient'], ['expert', 'Expertise']] }));
    rows.push(h('button.side-link', { onclick: () => { view.panel = { kind: 'adv' }; rerender(); } }, '＋ Advantage or disadvantage on checks…'));
  } else {
    rows = [
      adjustRow(c, update, 'ac', 'Armor Class', d.ac), adjustRow(c, update, 'initiative', 'Initiative', fmt(d.initiative)),
      adjustRow(c, update, 'speed', 'Speed (ft)', d.speed), adjustRow(c, update, 'hp', 'Max Hit Points', d.hpMax),
      adjustRow(c, update, 'passive:perception', 'Passive Perception', d.passivePerception), adjustRow(c, update, 'passive:investigation', 'Passive Investigation', d.passiveInvestigation),
      adjustRow(c, update, 'passive:insight', 'Passive Insight', d.passiveInsight),
      d.spellcasting ? adjustRow(c, update, 'spell:attack', 'Spell Attack', fmt(d.spellcasting.attack)) : null,
      d.spellcasting ? adjustRow(c, update, 'spell:dc', 'Spell Save DC', d.spellcasting.dc) : null,
    ];
  }
  return [tabs, help, h('div.adj-list', {}, rows)];
}

// ------------------------------------------------------------------ advantage / disadvantage
function advPanel(c, d, update, view, rerender) {
  const list = c.custom?.adv || [];
  const label = Object.fromEntries(ADV_TARGETS);
  const draft = view.panel.draft ||= { kind: 'adv', target: 'save:all', note: '' };
  return [
    h('p.side-help', {}, 'These show on the sheet as A (advantage) or D (disadvantage) and are applied automatically when you roll. If a roll has both, they cancel out.'),
    list.length ? h('div.adv-list', {}, list.map((x) => h('div.adv-item', {},
      h(`span.adv-badge.${x.kind}`, {}, x.kind === 'adv' ? 'A' : 'D'),
      h('div', {}, h('b', {}, label[x.target] || x.target), x.note ? h('div.side-muted', {}, x.note) : null),
      h('button.adj-reset', { title: 'Remove', onclick: () => update((y) => { ensure(y).adv = y.custom.adv.filter((z) => z.id !== x.id); }) }, '✕')))) : h('p.side-muted', {}, 'None yet.'),
    h('div.adv-form', {},
      h('div.seg-ds', {}, [['adv', 'Advantage'], ['dis', 'Disadvantage']].map(([k, l]) => h(`button${draft.kind === k ? '.on' : ''}`, { onclick: () => { draft.kind = k; rerender(); } }, l))),
      h('select', { onchange: (e) => { draft.target = e.target.value; } }, ADV_TARGETS.map(([v, l]) => h('option', { value: v, selected: draft.target === v }, l))),
      h('input', { placeholder: 'Note (optional), e.g. against poison', value: draft.note, oninput: (e) => { draft.note = e.target.value; } }),
      h('button.ds-btn.wide', { onclick: () => { update((y) => { ensure(y).adv.push({ id: Date.now().toString(36), kind: draft.kind, target: draft.target, note: draft.note.trim() }); }); draft.note = ''; } }, 'Add')),
  ];
}

// ------------------------------------------------------------------ spells
function spellPanel(c, d, update, view) {
  const st = view.panel; st.q ??= ''; st.onlyList ??= !!d.spellcasting; st.level ??= '';
  const list = d.spellcasting ? [d.spellcasting.list].flat() : [];
  const isWizard = d.cls?.id === 'wizard';
  const results = h('div.spell-results');
  const onSheet = (id) => c.spells.cantrips.includes(id) || c.spells.prepared.includes(id) || (c.spells.spellbook || []).includes(id) || (c.extras?.spells || []).some((x) => x.spellId === id) || d.grantedSpells.some((g) => g.spellId === id);
  const draw = () => {
    const q = st.q.trim().toLowerCase();
    const found = all('spells').filter((sp) => (!q || sp.name.toLowerCase().includes(q)) && (st.level === '' || sp.level === Number(st.level)) && (!st.onlyList || !list.length || sp.classes.some((k) => list.includes(k))))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).slice(0, 60);
    results.replaceChildren(...(found.length ? found.map((sp) => {
      const here = onSheet(sp.id);
      const btn = (label, fn, title) => h('button.mini-btn', { title, onclick: () => { update(fn); toast(`${sp.name} added`); } }, label);
      const acts = here ? [h('span.side-muted', {}, 'On sheet'), h('button.mini-btn.danger', { onclick: () => update((x) => removeSpell(x, sp.id)) }, 'Remove')]
        : sp.level === 0 ? [btn('Cantrip', (x) => { x.spells.cantrips.push(sp.id); }, 'Add as a cantrip you know'), btn('Other', (x) => { (x.extras.spells ||= []).push({ spellId: sp.id, source: st.source || 'Added' }); }, 'Add from another source (feat, item, species…)')]
          : [isWizard ? btn('Spellbook', (x) => { x.spells.spellbook = [...new Set([...(x.spells.spellbook || []), sp.id])]; }, 'Add to your spellbook (prepare it in the Spells tab)') : null,
            d.spellcasting ? btn('Prepare', (x) => { x.spells.prepared.push(sp.id); if (isWizard) x.spells.spellbook = [...new Set([...(x.spells.spellbook || []), sp.id])]; }, 'Add as a prepared/known spell') : null,
            btn('Other', (x) => { (x.extras.spells ||= []).push({ spellId: sp.id, source: st.source || 'Added', freePerLongRest: st.free ? 1 : 0 }); }, 'Always available, from another source; uses your spell slots')];
      return h('div.res-row', {}, h('div', {}, h('i', {}, sp.name), h('small', {}, `${sp.level ? `${ORD(sp.level)} level` : 'Cantrip'} · ${sp.school}${sp.source && sp.source !== 'SRD' ? ` · ${sp.source}` : ''}`)), h('div.res-acts', {}, acts));
    }) : [h('p.side-muted', {}, 'No spells match.')]));
  };
  draw();
  const prepMax = d.spellcasting?.preparedMax;
  return [
    prepMax ? h('p.side-help', {}, `Prepared: ${c.spells.prepared.length} / ${prepMax}. You can go over the limit if your DM allows it.`) : null,
    h('input.side-search', { 'data-k': 'spell-q', type: 'search', placeholder: 'Search all spells…', value: st.q, oninput: (e) => { st.q = e.target.value; draw(); } }),
    h('div.side-filters', {},
      h('select', { onchange: (e) => { st.level = e.target.value; draw(); } }, h('option', { value: '' }, 'Any level'), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => h('option', { value: l, selected: String(l) === String(st.level) }, l ? `${ORD(l)} level` : 'Cantrips'))),
      list.length ? h('label.side-check', {}, h('input', { type: 'checkbox', checked: st.onlyList, onchange: (e) => { st.onlyList = e.target.checked; draw(); } }), ` ${d.cls.name} list only`) : null),
    h('details.side-more', {}, h('summary', {}, 'Options for "Other"'),
      h('input', { placeholder: 'Source label, e.g. Ring of Spell Storing', value: st.source || '', oninput: (e) => { st.source = e.target.value; } }),
      h('label.side-check', {}, h('input', { type: 'checkbox', checked: !!st.free, onchange: (e) => { st.free = e.target.checked; } }), ' Free once per Long Rest')),
    results,
  ];
}

// ------------------------------------------------------------------ items
const CLOTHING = /\b(clothes|robe|cloak|costume|vestments?|boots|gloves|hat|cape|mantle|garb|outfit)\b/i;
const TOOLS = /tools|supplies|kit|utensils|instrument/i;
const ITEM_FILTERS = [['all', 'ALL'], ['weapon', 'WEAPONS'], ['armor', 'ARMOR'], ['clothing', 'CLOTHING'], ['gear', 'GEAR'], ['tools', 'TOOLS'], ['magic-item', 'MAGIC ITEMS']];
const matchType = (it, t) => t === 'all' || (t === 'clothing' ? CLOTHING.test(it.name) : t === 'tools' ? (TOOLS.test(it.name) || /tools|instrument|gaming/.test(it.subtype || '')) : t === 'gear' ? it.type === 'gear' && !CLOTHING.test(it.name) : it.type === t);

function itemPanel(c, d, update, view, rerender) {
  const st = view.panel; st.q ??= ''; st.type ??= 'all'; st.tab ??= 'catalog';
  const tabs = h('div.ds-chips', {}, [['catalog', 'FROM THE CATALOGUE'], ['custom', 'CUSTOM ITEM']].map(([id, l]) => h(`button${st.tab === id ? '.on' : ''}`, { onclick: () => { st.tab = id; rerender(); } }, l)));
  if (st.tab === 'custom') return [tabs, itemForm(null, (custom, qty) => { update((x) => { x.inventory.push({ itemId: null, qty, equipped: false, custom }); }); toast(`${custom.name} added`); })];
  const results = h('div.spell-results');
  const draw = () => {
    const q = st.q.trim().toLowerCase();
    const found = all('items').filter((it) => (!q || it.name.toLowerCase().includes(q)) && matchType(it, st.type)).sort((a, b) => (a.type === 'magic-item') - (b.type === 'magic-item') || (q && (b.name.toLowerCase() === q) - (a.name.toLowerCase() === q)) || a.name.localeCompare(b.name)).slice(0, 80);
    results.replaceChildren(...(found.length ? found.map((it) => {
      const qty = h('input.qty', { type: 'number', min: 1, value: 1, title: 'Quantity' });
      const meta = it.type === 'weapon' ? `${cap(it.category)} weapon · ${it.damage} ${it.dtype}` : it.type === 'armor' ? `${cap(it.armorType)} armor · AC ${it.armorType === 'shield' ? '+2' : it.ac}` : it.type === 'magic-item' ? `${it.rarity || 'Magic item'}${it.attunement ? ' · attunement' : ''}` : `${it.weight ?? 0} lb${it.cost !== undefined ? ` · ${it.cost} GP` : ''}`;
      return h('div.res-row', {}, h('div', {}, h('b', {}, it.name), h('small', {}, meta)),
        h('div.res-acts', {}, qty, h('button.mini-btn', { onclick: () => { const n = Math.max(1, Number(qty.value) || 1); update((x) => { const ex = x.inventory.find((o) => o.itemId === it.id && !o.equipped && !o.label); if (ex) ex.qty += n; else x.inventory.push({ itemId: it.id, qty: n, equipped: false }); }); toast(`Added ${n} × ${it.name}`); } }, 'Add')));
    }) : [h('p.side-muted', {}, 'Nothing matches. Try the Custom Item tab.')]));
  };
  draw();
  return [tabs,
    h('input.side-search', { 'data-k': 'item-q', type: 'search', placeholder: 'Search weapons, armor, clothes, gear…', value: st.q, oninput: (e) => { st.q = e.target.value; draw(); } }),
    h('div.ds-chips.small', {}, ITEM_FILTERS.map(([id, l]) => h(`button${st.type === id ? '.on' : ''}`, { onclick: () => { st.type = id; rerender(); } }, l))),
    results];
}

const WEAPON_PROPS = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Thrown', 'Two-Handed', 'Versatile'];
const DAMAGE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

/** Form for a custom item (new, or editing one). onSave(custom, qty). */
function itemForm(existing, onSave, { qty: q0 = 1, saveLabel = 'Add item' } = {}) {
  const f = { name: '', type: 'gear', weight: 0, cost: 0, desc: '', category: 'simple', kind: 'melee', damage: '1d6', dtype: 'slashing', props: [], range: '', versatile: '', armorType: 'light', ac: 11, rarity: 'Uncommon', attunement: false, clothing: false, ...(existing ? structuredClone(existing) : {}) };
  if (f.clothing) f.type = 'clothing';
  let qty = q0;
  const box = h('div.item-form');
  const field = (label, input) => h('label.f', {}, h('small', {}, label), input);
  const draw = () => {
    const t = f.type;
    box.replaceChildren(...[
      field('NAME', h('input', { value: f.name, placeholder: 'e.g. Grandmother’s Lantern', oninput: (e) => { f.name = e.target.value; } })),
      h('div.f-row', {},
        field('TYPE', h('select', { onchange: (e) => { f.type = e.target.value; draw(); } }, [['gear', 'Gear'], ['clothing', 'Clothing'], ['weapon', 'Weapon'], ['armor', 'Armor / Shield'], ['tool', 'Tool'], ['magic-item', 'Magic item']].map(([v, l]) => h('option', { value: v, selected: t === v }, l)))),
        field('QTY', h('input', { type: 'number', min: 1, value: qty, oninput: (e) => { qty = Math.max(1, Number(e.target.value) || 1); } })),
        field('WEIGHT (LB)', h('input', { type: 'number', min: 0, step: '0.1', value: f.weight, oninput: (e) => { f.weight = Number(e.target.value) || 0; } })),
        field('COST (GP)', h('input', { type: 'number', min: 0, step: '0.01', value: f.cost, oninput: (e) => { f.cost = Number(e.target.value) || 0; } }))),
      t === 'weapon' ? [
        h('div.f-row', {},
          field('CATEGORY', h('select', { onchange: (e) => { f.category = e.target.value; } }, [['simple', 'Simple'], ['martial', 'Martial']].map(([v, l]) => h('option', { value: v, selected: f.category === v }, l)))),
          field('KIND', h('select', { onchange: (e) => { f.kind = e.target.value; } }, [['melee', 'Melee'], ['ranged', 'Ranged']].map(([v, l]) => h('option', { value: v, selected: f.kind === v }, l)))),
          field('DAMAGE', h('input', { value: f.damage, placeholder: '1d8', oninput: (e) => { f.damage = e.target.value.trim(); } })),
          field('DAMAGE TYPE', h('select', { onchange: (e) => { f.dtype = e.target.value; } }, DAMAGE.map((v) => h('option', { value: v, selected: f.dtype === v }, cap(v)))))),
        h('div.f-row', {},
          field('RANGE (e.g. 20/60)', h('input', { value: f.range, oninput: (e) => { f.range = e.target.value.trim(); } })),
          field('VERSATILE DAMAGE', h('input', { value: f.versatile, placeholder: 'e.g. 1d10', oninput: (e) => { f.versatile = e.target.value.trim(); } }))),
        h('div.f-props', {}, WEAPON_PROPS.map((p) => h('label.side-check', {}, h('input', { type: 'checkbox', checked: f.props.includes(p), onchange: (e) => { f.props = e.target.checked ? [...f.props, p] : f.props.filter((x) => x !== p); } }), ` ${p}`))),
      ] : null,
      t === 'armor' ? h('div.f-row', {},
        field('ARMOR TYPE', h('select', { onchange: (e) => { f.armorType = e.target.value; draw(); } }, [['light', 'Light'], ['medium', 'Medium'], ['heavy', 'Heavy'], ['shield', 'Shield']].map(([v, l]) => h('option', { value: v, selected: f.armorType === v }, l)))),
        f.armorType !== 'shield' ? field('BASE AC', h('input', { type: 'number', value: f.ac, oninput: (e) => { f.ac = Number(e.target.value) || 10; } })) : h('small.side-muted', {}, 'Shields add +2 AC.')) : null,
      t === 'magic-item' ? h('div.f-row', {},
        field('RARITY', h('select', { onchange: (e) => { f.rarity = e.target.value; } }, ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'].map((v) => h('option', { selected: f.rarity === v }, v)))),
        h('label.side-check', {}, h('input', { type: 'checkbox', checked: f.attunement, onchange: (e) => { f.attunement = e.target.checked; } }), ' Requires attunement')) : null,
      field('NOTES', h('textarea', { rows: 3, placeholder: 'What it does, where you got it…', oninput: (e) => { f.desc = e.target.value; } }, f.desc)),
      h('button.ds-btn.wide', { onclick: () => {
        if (!f.name.trim()) { toast('Give the item a name'); return; }
        const out = { name: f.name.trim(), weight: f.weight, cost: f.cost, desc: f.desc };
        if (t === 'weapon') Object.assign(out, { type: 'weapon', category: f.category, kind: f.kind, damage: f.damage || '1d4', dtype: f.dtype, props: f.props, ...(f.range ? { range: f.range } : {}), ...(f.versatile ? { versatile: f.versatile } : {}), mastery: existing?.mastery });
        else if (t === 'armor') Object.assign(out, { type: 'armor', armorType: f.armorType, ac: f.armorType === 'shield' ? 2 : f.ac });
        else if (t === 'magic-item') Object.assign(out, { type: 'magic-item', rarity: f.rarity, attunement: f.attunement, category: 'Wondrous item' });
        else Object.assign(out, { type: 'gear', ...(t === 'clothing' ? { clothing: true } : {}), ...(t === 'tool' ? { subtype: 'other-tools' } : {}) });
        onSave(out, qty);
        if (!existing) { f.name = ''; f.desc = ''; draw(); }
      } }, saveLabel)].flat().filter(Boolean));
  };
  draw();
  return box;
}

function editItemPanel(c, d, update, view, rerender) {
  const i = view.panel.arg; const e = c.inventory[i];
  if (!e) { view.panel = null; return h('p.side-muted', {}, 'That item is gone.'); }
  const base = getItem(e.itemId);
  const remove = h('button.ds-btn.wide.danger-btn', { onclick: () => { update((x) => { x.inventory.splice(i, 1); }); view.panel = null; rerender(); } }, 'Remove from inventory');
  if (!base) {
    return [itemForm(e.custom, (custom, qty) => { update((x) => { x.inventory[i].custom = custom; x.inventory[i].qty = qty; }); toast('Item saved'); }, { qty: e.qty, saveLabel: 'Save changes' }), remove];
  }
  const f = { label: e.label || '', weight: e.weight ?? '', notes: e.notes || '', qty: e.qty };
  const field = (label, input) => h('label.f', {}, h('small', {}, label), input);
  return [
    h('p.side-help', {}, `${base.name} — ${base.type === 'weapon' ? `${cap(base.category)} weapon, ${base.damage} ${base.dtype}` : base.type === 'armor' ? `${cap(base.armorType)} armor` : base.type === 'magic-item' ? base.rarity : 'gear'}. Change how it appears on your sheet:`),
    h('div.item-form', {},
      field('NAME ON SHEET', h('input', { value: f.label, placeholder: base.name, oninput: (ev) => { f.label = ev.target.value; } })),
      h('div.f-row', {},
        field('QTY', h('input', { type: 'number', min: 1, value: f.qty, oninput: (ev) => { f.qty = Math.max(1, Number(ev.target.value) || 1); } })),
        field('WEIGHT EACH (LB)', h('input', { type: 'number', min: 0, step: '0.1', value: f.weight, placeholder: String(base.weight ?? 0), oninput: (ev) => { f.weight = ev.target.value; } }))),
      field('NOTES', h('textarea', { rows: 3, oninput: (ev) => { f.notes = ev.target.value; } }, f.notes)),
      h('button.ds-btn.wide', { onclick: () => { update((x) => { const it = x.inventory[i]; it.qty = f.qty; if (f.label.trim()) it.label = f.label.trim(); else delete it.label; if (f.weight === '' || f.weight === null) delete it.weight; else it.weight = Number(f.weight); if (f.notes.trim()) it.notes = f.notes.trim(); else delete it.notes; }); toast('Item saved'); } }, 'Save changes')),
    remove,
  ];
}
