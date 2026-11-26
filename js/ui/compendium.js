// Rules compendium: searchable browser over all loaded content (SRD 5.2 + enabled homebrew).
import { h, cap, rich } from './dom.js';
import { all, CONDITIONS, WEAPON_MASTERIES } from '../data/index.js';
import { spellLine } from './components.js';
import { statBlock, crLabel } from './statblock.js';
import { saveEntry } from './homebrew.js';
import { renderLibrary, packColor } from './library.js';
import { loadPacks, SRD_PACK, BUILTIN_PACKS } from '../data/index.js';

/** Copy any entry into My Homebrew and open it in the editor. */
function copyToHomebrew(kind, entry) {
  const { source, packId, sourceName, cls, ...rest } = structuredClone({ ...entry, cls: undefined });
  const id = `hb-${String(entry.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
  saveEntry(kind, { ...rest, ...(entry.cls ? { classId: entry.cls.id } : {}), id });
  location.hash = `#homebrew-edit-${kind}-${id}`;
}
const copyBtn = (kind, entry) => h('button.btn.small.copy-hb', { type: 'button', title: 'Make an editable copy in My Homebrew', onclick: (e) => { e.preventDefault(); e.stopPropagation(); copyToHomebrew(kind, entry); } }, '＋ Copy to Homebrew');

const TABS = [['library', 'Library'], ['spells', 'Spells'], ['monsters', 'Monsters'], ['items', 'Equipment'], ['magic', 'Magic Items'], ['classes', 'Classes'], ['subclasses', 'Subclasses'], ['species', 'Species'], ['backgrounds', 'Backgrounds'], ['feats', 'Feats'], ['rules', 'Rules']];
let state = { tab: 'library', q: '', level: '', cls: '', school: '', cr: '', kind: '', itype: '', rarity: '', src: '', edition: '', pack: '' };
const CLEAR = { level: '', cls: '', school: '', cr: '', kind: '', itype: '', rarity: '', src: '', edition: '', pack: '', q: '' };
const packName = (id) => (id === SRD_PACK.id ? 'Core Rules (SRD 5.2)' : loadPacks().find((p) => p.id === id)?.name || BUILTIN_PACKS.find((p) => p.id === id)?.name || (id === 'my-homebrew' ? 'My Homebrew' : id));

/** Every subclass, flattened, with its parent class attached. */
const allSubclasses = () => all('classes').flatMap((c) => (c.subclasses || []).map((s) => ({ ...s, cls: c })));
const EDITION = { 2014: '2014 rules (adapted)', tov: 'Tales of the Valiant', 2024: '2024 rules' };
const MAX = 150;

/** <details> whose body is built only when first opened (keeps long lists fast). */
function lazy(summary, build, copy) {
  let built = false;
  const body = h('div.sp-body');
  return h('details.spell-line', { ontoggle: (e) => { if (e.target.open && !built) { built = true; body.append(...[copy ? h('div.copy-row', {}, copyBtn(...copy)) : null, build()].flat().filter(Boolean)); } } }, h('summary', {}, summary), body);
}
const src = (e) => (e.source && e.source !== 'SRD' ? h('em.src', {}, e.source) : null);

export function renderCompendium(root, sub) {
  // #compendium-library and #compendium-library-<pack id> open the Library.
  if (sub !== undefined && sub !== null) {
    const m = sub.match(/^library(?:-(.+))?$/);
    if (m) { state.tab = 'library'; return renderShell(root, (host) => renderLibrary(host, m[1], (tab, pack, q = '') => { state = { ...state, ...CLEAR, tab, pack, q }; location.hash = '#compendium'; })); }
  }
  if (state.tab === 'library') return renderShell(root, (host) => renderLibrary(host, null, (tab, pack, q = '') => { state = { ...state, ...CLEAR, tab, pack, q }; location.hash = '#compendium'; renderCompendium(root); }));
  const rerender = () => renderCompendium(root);
  const set = (patch) => { state = { ...state, ...patch }; rerender(); };
  const q = state.q.toLowerCase();
  const match = (...fields) => !q || fields.some((f) => String(f || '').toLowerCase().includes(q));
  const filterSelect = (key, label, options) => h('select', { onchange: (e) => set({ [key]: e.target.value }) }, h('option', { value: '' }, label),
    options.map(([v, l]) => h('option', { value: v, selected: String(v) === state[key] }, l)));
  let list = []; let filters = [];
  const KIND = { spells: 'spells', monsters: 'monsters', items: 'items', magic: 'items', classes: 'classes', species: 'species', backgrounds: 'backgrounds', feats: 'feats' }[state.tab];
  const srcName = (e) => (e.source === 'SRD' || !e.source ? 'Core Rules (SRD 5.2)' : e.source);
  const srcOk = (e) => (!state.src || srcName(e) === state.src) && (!state.pack || e.packId === state.pack || (state.pack === SRD_PACK.id && (!e.source || e.source === 'SRD')));
  const pool = state.tab === 'subclasses' ? allSubclasses() : KIND ? all(KIND).filter((e) => state.tab !== 'magic' || e.type === 'magic-item') : [];
  const sourceFilter = pool.length ? filterSelect('src', 'All sources', [...new Set(pool.map(srcName))].sort().map((x) => [x, x])) : null;

  if (state.tab === 'spells') {
    filters = [filterSelect('level', 'Any level', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => [l, l ? `Level ${l}` : 'Cantrip'])),
      filterSelect('cls', 'Any class', all('classes').map((c) => [c.id, c.name])),
      filterSelect('school', 'Any school', [...new Set(all('spells').map((s) => s.school))].sort().map((s) => [s, s]))];
    list = all('spells').filter((s) => srcOk(s) && match(s.name, s.desc) && (state.level === '' || s.level === Number(state.level)) && (!state.cls || s.classes.includes(state.cls)) && (!state.school || s.school === state.school))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).map((sp) => { const line = spellLine(sp); line.querySelector('.sp-body')?.prepend(h('div.copy-row', {}, copyBtn('spells', sp))); return line; });
  } else if (state.tab === 'monsters') {
    const crs = [...new Set(all('monsters').map((m) => m.cr))].sort((a, b) => a - b);
    filters = [filterSelect('cr', 'Any CR', crs.map((c) => [c, `CR ${crLabel(c)}`])), filterSelect('kind', 'Any type', [...new Set(all('monsters').map((m) => m.kind))].sort().map((k) => [k, cap(k)]))];
    list = all('monsters').filter((m) => srcOk(m) && match(m.name, m.kind) && (state.cr === '' || String(m.cr) === state.cr) && (!state.kind || m.kind === state.kind))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => lazy([h('span.sp-name', {}, m.name), h('span.sp-meta', {}, `CR ${crLabel(m.cr)} · ${m.size} ${m.kind} · AC ${m.ac} · HP ${m.hp}`), src(m)], () => statBlock(m), ['monsters', m]));
  } else if (state.tab === 'items') {
    filters = [filterSelect('itype', 'All equipment', [['weapon', 'Weapons'], ['armor', 'Armor & Shields'], ['gear', 'Gear & Tools']])];
    list = all('items').filter((e) => srcOk(e) && e.type !== 'magic-item' && match(e.name, e.desc) && (!state.itype || e.type === state.itype)).sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => lazy([h('span.sp-name', {}, e.name), h('span.sp-meta', {}, itemMeta(e)), src(e)], () => itemBody(e), ['items', e]));
  } else if (state.tab === 'magic') {
    const rarities = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'];
    filters = [filterSelect('rarity', 'Any rarity', rarities.map((r) => [r, r])), filterSelect('itype', 'Any category', [...new Set(all('items').filter((i) => i.type === 'magic-item').map((i) => i.category))].sort().map((c) => [c, c]))];
    list = all('items').filter((e) => srcOk(e) && e.type === 'magic-item' && match(e.name, e.desc) && (!state.rarity || e.rarity.includes(state.rarity === 'Varies' ? 'Varies' : state.rarity)) && (!state.itype || e.category === state.itype))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => lazy([h('span.sp-name', {}, e.name), h('span.sp-meta', {}, `${e.category} · ${e.rarity}${e.attunement ? ' · Attunement' : ''}`), src(e)],
        () => [e.subtitle ? h('p.muted', {}, h('em', {}, e.subtitle)) : null, rich(e.desc)], ['items', e]));
  } else if (state.tab === 'subclasses') {
    const subs = allSubclasses();
    filters = [filterSelect('cls', 'Any class', all('classes').map((c) => [c.id, `${c.name} (${subs.filter((x) => x.cls.id === c.id).length})`])),
      filterSelect('edition', 'Any rules edition', [['2024', '2024 rules'], ['2014', '2014 rules (adapted)'], ['tov', 'Tales of the Valiant']])];
    const ed = (x) => (x.source === 'SRD' ? '2024' : x.edition || '2024');
    list = subs.filter((x) => srcOk(x) && (!state.cls || x.cls.id === state.cls) && (!state.edition || ed(x) === state.edition)
        && match(x.name, x.desc, x.text, x.cls.name, ...(x.features || []).map((f) => f.name)))
      .sort((a, b) => a.cls.name.localeCompare(b.cls.name) || a.name.localeCompare(b.name))
      .map((x) => lazy([h('span.sp-name', {}, x.name), h('span.sp-meta', {}, `${x.cls.name}${ed(x) !== '2024' ? ` · ${EDITION[ed(x)]}` : ''} · ${(x.features || []).length} features`), src(x)], () => [
        h('p.muted', {}, `${x.cls.name} subclass, chosen at level ${x.cls.subclassLevel || 3}. Features at levels ${[...new Set((x.features || []).map((f) => f.level))].join(', ') || '—'}.`),
        x.text ? rich(x.text) : h('p', {}, x.desc),
        h('div.feature-list', {}, (x.features || []).map((f) => h('details.feature', {}, h('summary', {}, h('span.lv', {}, `Lv ${f.level}`), f.name), rich(f.text || f.desc)))),
      ], ['subclasses', x]));
  } else if (state.tab === 'rules') {
    list = [h('h3', {}, 'Conditions'), CONDITIONS.filter((c) => match(c.name, c.desc)).map((c) => lazy(h('span.sp-name', {}, c.name), () => rich(c.desc))),
      h('h3', {}, 'Weapon Mastery Properties'), Object.entries(WEAPON_MASTERIES).filter(([k, v]) => match(k, v)).map(([k, v]) => lazy(h('span.sp-name', {}, k), () => h('p', {}, v)))];
  } else {
    list = all(state.tab).filter((e) => srcOk(e) && match(e.name, e.desc, e.tagline)).sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => lazy([h('span.sp-name', {}, e.name), e.category ? h('span.sp-meta', {}, cap(e.category.replace('-', ' '))) : null, src(e)], () => summary(state.tab, e), [state.tab, e]));
  }
  const total = list.flat().length;
  root.replaceChildren(h('div.compendium', {},
    h('h1', {}, 'Compendium'),
    tabsNav(root),
    state.pack ? h('div.pack-filter', { style: `--pc:${packColor({ id: state.pack, color: loadPacks().find((p) => p.id === state.pack)?.color })}` },
      h('span', {}, 'Showing only ', h('b', {}, packName(state.pack))),
      h('a.linkish', { href: `#compendium-library-${state.pack}` }, 'Open in Library'),
      h('button.icon-btn', { title: 'Show everything', 'aria-label': 'Show everything', onclick: () => set({ pack: '' }) }, '✕')) : null,
    h('div.filters', {},
      h('input', { type: 'search', placeholder: 'Search…', value: state.q, oninput: (e) => { state.q = e.target.value; const pos = e.target.selectionStart; rerender(); const el = root.querySelector('.filters input'); el.focus(); el.setSelectionRange(pos, pos); } }),
      filters, sourceFilter),
    state.tab !== 'rules' ? h('p.muted.tiny', {}, `${total} result${total === 1 ? '' : 's'}${total > MAX ? ` — showing the first ${MAX}; search or filter to narrow down` : ''}`) : null,
    h('div.comp-list', {}, total ? list.slice(0, MAX) : h('p.muted', {}, 'Nothing matches.'))));
}
function tabsNav(root) {
  return h('nav.tabs', {}, TABS.map(([id, l]) => h(`button${state.tab === id ? '.on' : ''}${id === 'library' ? '.lib-tab' : ''}`, { onclick: () => {
    state = { ...state, ...CLEAR, tab: id };
    if (id === 'library') { if (location.hash !== '#compendium-library') location.hash = '#compendium-library'; else renderCompendium(root, 'library'); }
    else if (location.hash !== '#compendium') location.hash = '#compendium'; else renderCompendium(root);
  } }, l)));
}
function renderShell(root, fill) {
  const host = h('div');
  root.replaceChildren(h('div.compendium', {}, h('h1', {}, 'Compendium'), tabsNav(root), host));
  fill(host);
}

function itemMeta(e) {
  if (e.type === 'weapon') return `${cap(e.category)} ${e.kind} · ${e.damage} ${e.dtype} · ${e.mastery || ''}`;
  if (e.type === 'armor') return `${cap(e.armorType)} · AC ${e.armorType === 'shield' ? '+2' : e.ac}`;
  return `${e.cost} GP · ${e.weight} lb`;
}
function itemBody(e) {
  if (e.type === 'weapon') return [h('p', {}, `${cap(e.category)} ${e.kind} weapon. ${e.damage} ${cap(e.dtype)}${e.versatile ? ` (${e.versatile} two-handed)` : ''}. Properties: ${e.props.join(', ') || 'none'}${e.range ? ` (range ${e.range} ft)` : ''}.`),
    e.mastery ? h('p', {}, h('b', {}, `Mastery: ${e.mastery}. `), WEAPON_MASTERIES[e.mastery] || '') : null, h('p.muted.tiny', {}, `${e.cost} GP · ${e.weight} lb`), e.desc ? rich(e.desc) : null];
  if (e.type === 'armor') return h('p', {}, `${cap(e.armorType)} armor. AC ${e.armorType === 'shield' ? '+2' : `${e.ac}${e.armorType === 'light' ? ' + DEX' : e.armorType === 'medium' ? ' + DEX (max 2)' : ''}`}${e.strReq ? `. Strength ${e.strReq} required` : ''}${e.stealthDis ? '. Disadvantage on Stealth' : ''}. ${e.cost} GP, ${e.weight} lb.`);
  return [rich(e.desc), h('p.muted.tiny', {}, `${e.cost} GP · ${e.weight} lb${e.bundle ? ` (sold in bundles of ${e.bundle})` : ''}`)];
}

function summary(kind, e) {
  if (kind === 'classes') return [e.text ? rich(e.text) : h('p', {}, e.desc), h('p.muted', {}, `Hit Die d${e.hitDie} · Saves ${e.saves.join(', ').toUpperCase()} · Subclasses: ${(e.subclasses || []).map((s) => s.name).join(', ')}`),
    h('div.feature-list', {}, e.features.map((f) => h('details.feature', {}, h('summary', {}, h('span.lv', {}, `Lv ${f.level}`), f.name), rich(f.text || f.desc)))),
    (e.subclasses || []).map((s) => [h('h4', {}, s.name, src(s)), rich(s.text || s.desc), h('div.feature-list', {}, s.features.map((f) => h('details.feature', {}, h('summary', {}, h('span.lv', {}, `Lv ${f.level}`), f.name), rich(f.text || f.desc))))])];
  if (kind === 'species') return [e.text ? rich(e.text) : h('p', {}, e.desc), h('p.muted', {}, `${e.size} · Speed ${e.speed} ft${e.darkvision ? ` · Darkvision ${e.darkvision} ft` : ''}`), h('div.feature-list', {}, e.traits.map((t) => h('details.feature', {}, h('summary', {}, t.name), rich(t.text || t.desc))))];
  if (kind === 'backgrounds') return [rich(e.text || e.desc), h('p.muted', {}, `Ability Scores: ${e.anyAbilities ? 'any' : e.abilities.join(', ').toUpperCase()} · Skills: ${e.skills.map(cap).join(', ') || '—'} · Tool: ${e.tool || '—'} · Feat: ${e.feat?.choose ? 'any Origin feat' : e.feat?.id ? cap(e.feat.id.replace(/-/g, ' ')) : '—'}`)];
  if (kind === 'feats') return [e.prereq ? h('p', {}, h('em', {}, `Prerequisite: ${e.prereq}`)) : null, rich(e.text || e.desc)];
  return rich(e.text || e.desc);
}
