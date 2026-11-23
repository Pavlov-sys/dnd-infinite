// Homebrew: a form-based editor for your own content (saved in a personal "My Homebrew" pack),
// plus importing, exporting and toggling content packs. Everything stays in this browser.
import { h, cap, modal, toast, copyText, downloadText, confirmDialog, rich } from './dom.js';
import { parseImport, summarize, mergeInto, parseText } from '../engine/importers.js';
import { loadPacks, savePacks, validatePack, SRD_PACK, all, getClass, rebuild, ABILITIES, SKILLS, BUILTIN_PACKS, isBuiltinEnabled, setBuiltinEnabled } from '../data/index.js';
import { statBlock } from './statblock.js';

const MY = 'my-homebrew';
const DAMAGE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const MASTERY = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];
const PROPS = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Thrown', 'Two-Handed', 'Versatile'];
const RARITY = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
const slug = (s) => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const opt = (arr) => arr.map((v) => (Array.isArray(v) ? v : [v, cap(String(v))]));
const rowsOf = (fields) => ({ type: 'rows', fields });
const FEATURE_ROW = [{ k: 'level', label: 'Level', type: 'number', width: '5em', def: 1 }, { k: 'name', label: 'Name', type: 'text' }, { k: 'desc', label: 'Description', type: 'textarea' }];
const ACTION_ROW = [{ k: 'name', label: 'Name', type: 'text' }, { k: 'desc', label: 'Description (e.g. "Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Slashing damage.")', type: 'textarea' }];

// ---------------------------------------------------------------- form definitions per content type
export const TYPES = {
  subclasses: { label: 'Subclass', icon: '🎖', fields: () => [
    { k: 'classId', label: 'Class', type: 'select', options: all('classes').map((c) => [c.id, c.name]), req: true },
    { k: 'name', label: 'Subclass name', type: 'text', req: true, hint: 'e.g. Gunslinger' },
    { k: 'desc', label: 'Short description', type: 'text' },
    { k: 'text', label: 'Full description', type: 'textarea' },
    { k: 'features', label: 'Features', ...rowsOf(FEATURE_ROW), add: 'Add feature' },
  ] },
  species: { label: 'Species', icon: '🧝', fields: () => [
    { k: 'name', label: 'Name', type: 'text', req: true }, { k: 'desc', label: 'Description', type: 'textarea' },
    { k: 'size', label: 'Size', type: 'select', options: opt(SIZES), def: 'Medium' },
    { k: 'speed', label: 'Speed (ft)', type: 'number', def: 30 }, { k: 'darkvision', label: 'Darkvision (ft, 0 for none)', type: 'number', def: 0 },
    { k: 'hpPerLevel', label: 'Extra HP per level', type: 'number', def: 0 },
    { k: 'resist', label: 'Damage resistances', type: 'chips', options: opt(DAMAGE) },
    { k: 'traits', label: 'Traits', ...rowsOf(FEATURE_ROW), add: 'Add trait' },
  ] },
  backgrounds: { label: 'Background', icon: '📜', fields: () => [
    { k: 'name', label: 'Name', type: 'text', req: true }, { k: 'desc', label: 'Description', type: 'textarea' },
    { k: 'abilities', label: 'Ability scores (pick 3)', type: 'chips', max: 3, options: ABILITIES.map((a) => [a.id, a.name]) },
    { k: 'featId', label: 'Origin feat', type: 'select', options: all('feats').filter((f) => f.category === 'origin').map((f) => [f.id, f.name]) },
    { k: 'featList', label: 'Magic Initiate spell list (if that feat)', type: 'select', options: opt(['cleric', 'druid', 'wizard']) },
    { k: 'skills', label: 'Skill proficiencies (pick 2)', type: 'chips', max: 2, options: SKILLS.map((s) => [s.id, s.name]) },
    { k: 'tool', label: 'Tool proficiency', type: 'text' },
    { k: 'kit', label: 'Equipment option A', type: 'rows', add: 'Add item', fields: [{ k: 'item', label: 'Item', type: 'item' }, { k: 'qty', label: 'Qty', type: 'number', def: 1, width: '5em' }] },
    { k: 'kitGp', label: 'Gold with option A (GP)', type: 'number', def: 10 },
  ] },
  feats: { label: 'Feat', icon: '⭐', fields: () => [
    { k: 'name', label: 'Name', type: 'text', req: true },
    { k: 'category', label: 'Category', type: 'select', options: [['origin', 'Origin'], ['general', 'General'], ['fighting-style', 'Fighting Style'], ['epic-boon', 'Epic Boon']], def: 'general' },
    { k: 'prereq', label: 'Prerequisite (text)', type: 'text' },
    { k: 'text', label: 'Description', type: 'textarea', req: true },
    { k: 'plusOne', label: 'Grants +1 to an ability score', type: 'select', options: [['any', 'Any ability'], ['str,dex', 'Strength or Dexterity'], ['con', 'Constitution'], ['int,wis,cha', 'Intelligence, Wisdom or Charisma']] },
    { k: 'skillCount', label: 'Grants skill proficiencies (how many)', type: 'number', def: 0 },
    { k: 'initiativeProf', label: 'Adds Proficiency Bonus to Initiative', type: 'checkbox' },
  ] },
  spells: { label: 'Spell', icon: '✨', fields: () => [
    { k: 'name', label: 'Name', type: 'text', req: true },
    { k: 'level', label: 'Level', type: 'select', options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => [l, l ? `Level ${l}` : 'Cantrip']), def: 1, num: true },
    { k: 'school', label: 'School', type: 'select', options: opt(SCHOOLS), def: 'Evocation' },
    { k: 'time', label: 'Casting time', type: 'text', def: 'Action' }, { k: 'range', label: 'Range', type: 'text', def: '60 feet' },
    { k: 'components', label: 'Components', type: 'text', def: 'V, S' }, { k: 'duration', label: 'Duration', type: 'text', def: 'Instantaneous' },
    { k: 'concentration', label: 'Concentration', type: 'checkbox' }, { k: 'ritual', label: 'Ritual', type: 'checkbox' },
    { k: 'classes', label: 'Class spell lists', type: 'chips', options: all('classes').map((c) => [c.id, c.name]) },
    { k: 'desc', label: 'Description', type: 'textarea', req: true },
    { k: 'higherLevel', label: 'Using a higher-level spell slot', type: 'textarea' },
    { k: 'damage', label: 'Damage (for the roll button, e.g. "2d6 fire")', type: 'text' },
    { k: 'save', label: 'Saving throw', type: 'select', options: ABILITIES.map((a) => [a.id, a.name]) },
    { k: 'attack', label: 'Uses a spell attack roll', type: 'checkbox' },
  ] },
  items: { label: 'Item', icon: '🗡', fields: (d) => [
    { k: 'type', label: 'Kind of item', type: 'select', options: [['weapon', 'Weapon'], ['armor', 'Armor / Shield'], ['gear', 'Gear / Tool'], ['magic-item', 'Magic Item']], def: 'gear', rerender: true },
    { k: 'name', label: 'Name', type: 'text', req: true },
    ...(d.type === 'weapon' ? [
      { k: 'category', label: 'Category', type: 'select', options: opt(['simple', 'martial']), def: 'martial' },
      { k: 'kind', label: 'Melee or ranged', type: 'select', options: opt(['melee', 'ranged']), def: 'melee' },
      { k: 'damage', label: 'Damage dice', type: 'text', def: '1d8' }, { k: 'dtype', label: 'Damage type', type: 'select', options: opt(DAMAGE), def: 'slashing' },
      { k: 'props', label: 'Properties', type: 'chips', options: opt(PROPS) }, { k: 'versatile', label: 'Two-handed damage (Versatile)', type: 'text' },
      { k: 'range', label: 'Range (e.g. 80/320)', type: 'text' }, { k: 'mastery', label: 'Mastery', type: 'select', options: opt(MASTERY) },
    ] : []),
    ...(d.type === 'armor' ? [
      { k: 'armorType', label: 'Armor type', type: 'select', options: [['light', 'Light (AC + DEX)'], ['medium', 'Medium (AC + DEX max 2)'], ['heavy', 'Heavy (flat AC)'], ['shield', 'Shield (+AC)']], def: 'light' },
      { k: 'ac', label: 'Base AC (or shield bonus)', type: 'number', def: 11 }, { k: 'strReq', label: 'Strength required', type: 'number', def: 0 },
      { k: 'stealthDis', label: 'Disadvantage on Stealth', type: 'checkbox' },
    ] : []),
    ...(d.type === 'magic-item' ? [
      { k: 'category', label: 'Category', type: 'select', options: opt(['Armor', 'Potions', 'Rings', 'Rods', 'Scrolls', 'Staffs', 'Wands', 'Weapons', 'Wondrous Items']), def: 'Wondrous Items' },
      { k: 'rarity', label: 'Rarity', type: 'select', options: opt(RARITY), def: 'Uncommon' }, { k: 'attunement', label: 'Requires attunement', type: 'checkbox' },
    ] : []),
    { k: 'desc', label: 'Description', type: 'textarea' },
    { k: 'cost', label: 'Cost (GP)', type: 'number', def: 0 }, { k: 'weight', label: 'Weight (lb)', type: 'number', def: 0 },
  ] },
  monsters: { label: 'Monster', icon: '🐲', fields: () => [
    { k: 'name', label: 'Name', type: 'text', req: true },
    { k: 'size', label: 'Size', type: 'select', options: opt(SIZES), def: 'Medium' }, { k: 'kind', label: 'Type (e.g. undead)', type: 'text', def: 'humanoid' },
    { k: 'alignment', label: 'Alignment', type: 'text', def: 'neutral' },
    { k: 'ac', label: 'Armor Class', type: 'number', def: 12 }, { k: 'hp', label: 'Hit Points', type: 'number', def: 11 }, { k: 'hitDice', label: 'Hit dice (e.g. 2d8 + 2)', type: 'text' },
    { k: 'speed', label: 'Speed', type: 'text', def: '30 ft.' },
    { k: 'scores', label: 'Ability scores (STR DEX CON INT WIS CHA)', type: 'scores' },
    { k: 'senses', label: 'Senses', type: 'text', def: 'passive Perception 10' }, { k: 'languages', label: 'Languages', type: 'text', def: 'Common' },
    { k: 'cr', label: 'Challenge rating', type: 'number', def: 1, step: 'any' }, { k: 'xp', label: 'XP', type: 'number', def: 200 },
    { k: 'resist', label: 'Resistances', type: 'chips', options: opt(DAMAGE) }, { k: 'immune', label: 'Immunities', type: 'chips', options: opt(DAMAGE) },
    { k: 'traits', label: 'Traits', ...rowsOf(ACTION_ROW), add: 'Add trait' }, { k: 'actions', label: 'Actions', ...rowsOf(ACTION_ROW), add: 'Add action' },
    { k: 'bonusActions', label: 'Bonus Actions', ...rowsOf(ACTION_ROW), add: 'Add bonus action' }, { k: 'reactions', label: 'Reactions', ...rowsOf(ACTION_ROW), add: 'Add reaction' },
    { k: 'legendary', label: 'Legendary Actions', ...rowsOf(ACTION_ROW), add: 'Add legendary action' },
  ] },
  classes: { label: 'Class (advanced, JSON)', icon: '⚔', json: true },
};

// Converts the editor's flat form values into the content schema the app uses (and back).
const toEntry = {
  backgrounds: (d) => ({ id: d.id, name: d.name, desc: d.desc || '', abilities: d.abilities || [], skills: d.skills || [], tool: d.tool || '',
    feat: { id: d.featId || 'skilled', ...(d.featId === 'magic-initiate' ? { list: d.featList || 'wizard' } : {}) },
    equipment: [{ id: 'A', label: 'Gear', items: (d.kit || []).filter((r) => r.item).map((r) => [r.item, Number(r.qty) || 1]), gp: Number(d.kitGp) || 0 }, { id: 'B', label: 'Gold', items: [], gp: 50 }] }),
  feats: (d) => {
    const choices = [];
    if (d.plusOne) choices.push({ id: 'ability', type: 'ability-plus1', options: d.plusOne === 'any' ? 'any' : d.plusOne.split(',') });
    if (Number(d.skillCount) > 0) choices.push({ id: 'skills', type: 'skill', count: Number(d.skillCount) });
    return { id: d.id, name: d.name, category: d.category || 'general', prereq: d.prereq || undefined, desc: (d.text || '').split('\n')[0].slice(0, 160), text: d.text, choices, effects: d.initiativeProf ? { initiativeProf: true } : undefined, plusOne: d.plusOne, skillCount: d.skillCount, initiativeProf: d.initiativeProf };
  },
  species: (d) => ({ ...d, traits: (d.traits || []).map((t) => ({ ...t, level: Number(t.level) || 1 })), choices: [], speed: Number(d.speed) || 30, darkvision: Number(d.darkvision) || 0, hpPerLevel: Number(d.hpPerLevel) || 0 }),
  subclasses: (d) => ({ ...d, features: (d.features || []).map((f) => ({ ...f, level: Number(f.level) || 3 })) }),
  spells: (d) => ({ ...d, level: Number(d.level) || 0, classes: d.classes || [] }),
  items: (d) => ({ ...d, props: d.props || [], cost: Number(d.cost) || 0, weight: Number(d.weight) || 0, ...(d.type === 'armor' ? { ac: Number(d.ac) || 10, strReq: Number(d.strReq) || undefined } : {}) }),
  monsters: (d) => ({ ...d, scores: d.scores || [10, 10, 10, 10, 10, 10], ac: Number(d.ac), hp: Number(d.hp), cr: Number(d.cr), xp: Number(d.xp) }),
};
const clean = (e) => { const { source, packId, sourceName, ...rest } = e; return rest; };
const fromEntry = {
  feats: (e) => ({ ...e, text: e.text || e.desc, plusOne: e.plusOne ?? (() => { const c = (e.choices || []).find((x) => x.type === 'ability-plus1'); return c ? (c.options === 'any' || c.options?.length >= 6 ? 'any' : c.options.join(',')) : undefined; })(),
    skillCount: e.skillCount ?? (e.choices || []).find((x) => x.type === 'skill')?.count, initiativeProf: e.initiativeProf ?? !!e.effects?.initiativeProf }),
  backgrounds: (e) => ({ ...e, featId: e.feat?.id, featList: e.feat?.list, kit: (e.equipment?.[0]?.items || []).map(([item, qty]) => ({ item, qty })), kitGp: e.equipment?.[0]?.gp }),
};

// ---------------------------------------------------------------- storage helpers
function myPack() {
  const packs = loadPacks();
  const p = packs.find((x) => x.id === MY) || { id: MY, name: 'My Homebrew', version: '1.0.0', author: '', enabled: true, content: {} };
  return { packs, p };
}
function writeMy(p, packs) { savePacks([...packs.filter((x) => x.id !== MY), p]); rebuild(); }
export function saveEntry(type, entry, oldId) {
  const { packs, p } = myPack();
  const list = (p.content[type] ||= []);
  const i = list.findIndex((e) => e.id === (oldId || entry.id));
  if (i >= 0) list[i] = entry; else list.push(entry);
  writeMy(p, packs);
}
function deleteEntry(type, id) {
  const { packs, p } = myPack();
  p.content[type] = (p.content[type] || []).filter((e) => e.id !== id);
  writeMy(p, packs);
}

// ---------------------------------------------------------------- list page
export function renderHomebrew(root, sub, go) {
  if (sub) return renderEditor(root, sub, go);
  const rerender = () => renderHomebrew(root, null, go);
  const packs = loadPacks();
  const { p: mine } = myPack();
  const others = packs.filter((x) => x.id !== MY);
  const count = (pk) => Object.entries(pk.content || {}).filter(([, v]) => v.length).map(([k, v]) => `${v.length} ${k}`).join(', ') || 'empty';
  const mineEntries = Object.entries(TYPES).flatMap(([type]) => (mine.content[type] || []).map((e) => ({ type, e })));
  const openImport = (preset) => importDialog(preset, rerender);

  const page = h('div.homebrew', {},
    h('div.home-head', {}, h('div', {}, h('h1', {}, 'Homebrew'), h('p.muted', {}, 'Create, import and share your own content. It appears in the character builder and compendium right away, and is saved in this browser.')),
      h('div.row', {},
        h('button.btn', { onclick: () => openImport() }, '⇪ Import'),
        h('button.btn.primary', { onclick: () => exportDialog(mine), disabled: !mineEntries.length }, '⇩ Export'))),
    h('div.drop-hint', {}, 'Tip: drop a homebrew .json file anywhere on this page to import it. DND Infinite packs and 5etools homebrew files both work.'),
    h('div.card', {},
      h('div.row.between', {}, h('h3', {}, 'My Homebrew ', h('span.muted.tiny', {}, `· ${count(mine)}`))),
      h('div.new-grid', {}, Object.entries(TYPES).map(([type, t]) => h('a.new-tile', { href: `#homebrew-new-${type}` }, h('span.nt-ico', {}, t.icon), h('span', {}, `New ${t.label}`)))),
      h('p.muted.tiny', {}, 'Want to tweak something that already exists? Open it in the Compendium and press “Copy to My Homebrew”, or use “Start from…” in any editor.'),
      mineEntries.length ? [
        h('input.search', { type: 'search', placeholder: `Search ${mineEntries.length} entries…`, oninput: (ev) => { const q = ev.target.value.toLowerCase(); page.querySelectorAll('.hb-table tr').forEach((tr) => { tr.style.display = tr.dataset.name.includes(q) ? '' : 'none'; }); } }),
        h('table.hb-table', {}, h('tbody', {}, mineEntries.map(({ type, e }) => h('tr', { 'data-name': `${e.name} ${TYPES[type].label}`.toLowerCase() },
          h('td', {}, TYPES[type].icon), h('td', {}, h('b', {}, e.name), e.imported === 'ddb' ? h('span.pill.ddb-pill', { title: 'Placeholder created when importing a D&D Beyond character. Edit it to fill in details.' }, 'D&D Beyond import') : null, h('div.muted.tiny', {}, TYPES[type].label + (e.classId ? ` · ${getClass(e.classId)?.name || cap(e.classId)}` : '') + (e.level !== undefined && type === 'spells' ? ` · ${e.level ? `Level ${e.level}` : 'Cantrip'}` : ''))),
          h('td.actions', {},
            h('a.btn.small', { href: `#homebrew-edit-${type}-${e.id}` }, 'Edit'),
            h('button.btn.small', { title: 'Copy this entry as JSON', onclick: () => copyText(JSON.stringify({ ...e, kind: type }, null, 2)) }, 'Copy'),
            h('button.btn.small', { onclick: () => { saveEntry(type, { ...structuredClone(e), id: `${e.id}-copy-${Date.now().toString(36).slice(-3)}`, name: `${e.name} (copy)` }); rerender(); } }, 'Duplicate'),
            h('button.btn.small.danger', { onclick: () => confirmDialog(`Delete ${e.name}?`, 'Characters that use it will lose that option.', () => { deleteEntry(type, e.id); rerender(); }) }, 'Delete'))))))]
        : h('p.muted.center', {}, 'Nothing yet — pick a type above, or import a file.')),
    h('div.home-head', {}, h('div', {}, h('h2', {}, 'Built-in Content Packs'), h('p.muted', {}, 'Openly licensed books from other publishers (OGL 1.0a or CC-BY-4.0). Switch them on or off for everyone here, or per character in the builder\'s Settings → Sources. Changes reload the page.'))),
    h('div.pack-list', {}, BUILTIN_PACKS.map((bp) => h('div.pack', {},
      h('div', {}, h('h3', {}, bp.name, h('span.pill', {}, bp.license)), h('p.tiny', {}, bp.description),
        h('p.muted.tiny', {}, `${Object.entries(bp.counts).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(', ')} · ${bp.kb >= 1024 ? `${(bp.kb / 1024).toFixed(1)} MB` : `${bp.kb} KB`} · ${bp.sources.join(', ')}`)),
      h('label.toggle', {}, h('input', { type: 'checkbox', checked: isBuiltinEnabled(bp), onchange: (ev) => { setBuiltinEnabled(bp.id, ev.target.checked); toast('Reloading content…'); setTimeout(() => location.reload(), 300); } }), ' Enabled')))),
    h('div.home-head', {}, h('h2', {}, 'Imported Packs'), h('div.row', {}, h('button.btn', { onclick: () => { addPackObj(structuredClone(EXAMPLE_PACK)); rerender(); } }, 'Add example pack'))),
    others.length ? h('div.pack-list', {}, others.map((pk) => h('div.pack', {},
      h('div', {}, h('h3', {}, pk.name, pk.version ? h('span.muted.tiny', {}, ` v${pk.version}`) : null), h('p.muted.tiny', {}, `${count(pk)}${pk.author ? ` · by ${pk.author}` : ''}`)),
      h('div.row', {},
        h('label.toggle', {}, h('input', { type: 'checkbox', checked: pk.enabled !== false, onchange: (ev) => { savePacks(loadPacks().map((x) => (x.id === pk.id ? { ...x, enabled: ev.target.checked } : x))); rerender(); } }), ' Enabled'),
        h('button.btn.small', { title: 'Copy every entry into My Homebrew so you can edit them', onclick: () => { const { packs: all2, p } = myPack(); const r = mergeInto(p, pk); writeMy(p, all2); toast(`Copied ${r.added} entries into My Homebrew`); rerender(); } }, 'Copy to My Homebrew'),
        h('button.btn.small', { onclick: () => downloadText(`${pk.id}.json`, JSON.stringify(pk, null, 2)) }, 'Download'),
        h('button.btn.small.danger', { onclick: () => confirmDialog('Remove pack?', `Characters using "${pk.name}" content will lose those options.`, () => { savePacks(loadPacks().filter((x) => x.id !== pk.id)); rerender(); }, 'Remove') }, 'Remove')))))
      : h('p.muted', {}, 'No imported packs yet.'),
    h('p.muted.tiny', {}, 'Only share packs that contain your own creations or openly licensed material.'));

  // Drag and drop a file anywhere on the page.
  page.addEventListener('dragover', (ev) => { ev.preventDefault(); page.classList.add('dragging'); });
  page.addEventListener('dragleave', (ev) => { if (ev.target === page) page.classList.remove('dragging'); });
  page.addEventListener('drop', async (ev) => {
    ev.preventDefault(); page.classList.remove('dragging');
    const f = ev.dataTransfer.files[0]; if (f) openImport({ text: await f.text(), name: f.name.replace(/\.json$/i, '') });
  });
  root.replaceChildren(page);
}

function addPackObj(pack) {
  const errs = validatePack(pack);
  if (errs.length) { toast(errs[0]); return false; }
  const packs = loadPacks();
  let id = pack.id === MY ? `${pack.id}-imported` : pack.id;
  if (packs.some((x) => x.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
  savePacks([...packs, { ...pack, id, enabled: true }]); rebuild();
  return true;
}

/** Import: choose a source (file, paste or web address), preview what's inside, then merge or add as a pack. */
function importDialog(preset, done) {
  let parsed = null;
  const previewBox = h('div.import-preview');
  const show = (text, name) => {
    try { parsed = parseImport(text, name || 'Imported homebrew'); } catch { parsed = null; previewBox.replaceChildren(h('p.warn', {}, 'That isn\'t valid JSON. Check that you copied the whole file.')); return; }
    if (parsed.format === 'character') { previewBox.replaceChildren(h('p.warn', {}, parsed.warnings[0])); parsed = null; return; }
    const sum = summarize(parsed.pack);
    previewBox.replaceChildren(...[
      h('div.ip-head', {}, h('b', {}, parsed.pack.name), h('span.pill', {}, { pack: 'DND Infinite pack', entries: 'Entries', '5etools': '5etools homebrew' }[parsed.format])),
      sum.length ? h('ul.compact', {}, sum.map((x) => h('li', {}, h('b', {}, `${x.count} ${x.kind}`), ': ', x.names.join(', '), x.count > x.names.length ? '…' : ''))) : h('p.warn', {}, 'Nothing importable was found in this file.'),
      parsed.warnings.length ? h('ul.compact.warn', {}, parsed.warnings.map((w) => h('li', {}, w))) : null].filter(Boolean));
  };
  const ta = h('textarea.code', { rows: 8, placeholder: 'Paste a DND Infinite pack, a single entry, or a 5etools homebrew file…', oninput: () => show(ta.value) });
  const file = h('input', { type: 'file', accept: '.json,application/json', onchange: async (ev) => { const f = ev.target.files[0]; if (f) { ta.value = await f.text(); show(ta.value, f.name.replace(/\.json$/i, '')); } } });
  const url = h('input', { type: 'url', placeholder: 'https://raw.githubusercontent.com/…/homebrew.json' });
  const fetchUrl = async () => {
    try { const r = await fetch(url.value); if (!r.ok) throw new Error(r.status); ta.value = await r.text(); show(ta.value); }
    catch { previewBox.replaceChildren(h('p.warn', {}, 'Couldn\'t download that address. Inside Claude, pages can\'t reach other websites — download the file and use “From a file” instead. When you host DND Infinite yourself, raw GitHub links work.')); }
  };
  const drop = h('div.drop-zone', {
    ondragover: (ev) => { ev.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: async (ev) => { ev.preventDefault(); drop.classList.remove('over'); const f = ev.dataTransfer.files[0]; if (f) { ta.value = await f.text(); show(ta.value, f.name.replace(/\.json$/i, '')); } },
  }, h('div', {}, '⇪ Drop a .json file here'), h('div.muted.tiny', {}, 'or'), file);
  if (preset?.text) { ta.value = preset.text; setTimeout(() => show(preset.text, preset.name)); }
  modal('Import homebrew', h('div', {},
    drop,
    h('div.field', {}, h('label', {}, 'Or paste JSON'), ta),
    h('div.field', {}, h('label', {}, 'Or download from a web address'), h('div.row', {}, url, h('button.btn.small', { type: 'button', onclick: fetchUrl }, 'Fetch'))),
    h('h4', {}, 'Preview'), previewBox,
    h('p.muted.tiny', {}, '“Merge” adds everything to My Homebrew so you can edit it. “Add as pack” keeps it separate so you can switch it on and off as a whole.')),
  [{ label: 'Cancel' },
    { label: 'Merge into My Homebrew', onClick: () => { if (!parsed?.pack) { toast('Nothing to import yet'); return false; } const { packs, p } = myPack(); const r = mergeInto(p, parsed.pack); writeMy(p, packs); toast(`Added ${r.added} entries${r.renamed ? ` (${r.renamed} renamed to avoid clashes)` : ''}`); done(); return true; } },
    { label: 'Add as pack', primary: true, onClick: () => { if (!parsed?.pack) { toast('Nothing to import yet'); return false; } if (addPackObj(parsed.pack)) { toast(`Added “${parsed.pack.name}”`); done(); return true; } return false; } }]);
}

/** Export: choose entries from My Homebrew, name the pack, then download or copy it. */
function exportDialog(mine) {
  // Placeholders from D&D Beyond imports hold text from your own character sheet: left out unless you tick them.
  const chosen = new Set(Object.entries(mine.content).flatMap(([k, v]) => v.filter((e) => e.imported !== 'ddb').map((e) => `${k}:${e.id}`)));
  const meta = { name: 'My Homebrew', author: '', version: '1.0.0', license: '', description: '' };
  const build = () => {
    const content = {};
    for (const [k, v] of Object.entries(mine.content)) { const picked = v.filter((e) => chosen.has(`${k}:${e.id}`)); if (picked.length) content[k] = picked; }
    return { id: slug(meta.name) || 'homebrew', ...meta, content };
  };
  const countEl = h('span.muted.tiny');
  const refresh = () => { countEl.textContent = `${chosen.size} selected`; };
  const groups = Object.entries(mine.content).filter(([, v]) => v.length).map(([k, v]) => h('details.export-group', { open: true },
    h('summary', {}, h('label', { onclick: (ev) => ev.stopPropagation() }, h('input', { type: 'checkbox', checked: v.every((e) => chosen.has(`${k}:${e.id}`)),
      onchange: (ev) => { v.forEach((e) => (ev.target.checked ? chosen.add(`${k}:${e.id}`) : chosen.delete(`${k}:${e.id}`))); ev.target.closest('details').querySelectorAll('.ex-item').forEach((cb) => { cb.checked = ev.target.checked; }); refresh(); } }), ` ${TYPES[k]?.label || k} (${v.length})`)),
    h('div.export-items', {}, v.map((e) => h('label', {}, h('input.ex-item', { type: 'checkbox', checked: chosen.has(`${k}:${e.id}`), onchange: (ev) => { ev.target.checked ? chosen.add(`${k}:${e.id}`) : chosen.delete(`${k}:${e.id}`); refresh(); } }), ` ${e.name}`, e.imported === 'ddb' ? h('span.muted.tiny', {}, ' (D&D Beyond import)') : null)))));
  const metaField = (key, label, ph) => h('div.field', {}, h('label', {}, label), h('input', { value: meta[key], placeholder: ph || '', oninput: (ev) => { meta[key] = ev.target.value; } }));
  refresh();
  modal('Export homebrew', h('div', {},
    h('div.grid2', {}, metaField('name', 'Pack name'), metaField('author', 'Author', 'Your name'), metaField('version', 'Version'), metaField('license', 'License (optional)', 'e.g. CC-BY-4.0')),
    metaField('description', 'Description', 'What’s inside, in a sentence'),
    h('div.row.between', {}, h('h4', {}, 'Include'), countEl), groups,
    Object.values(mine.content).some((v) => v.some((e) => e.imported === 'ddb')) ? h('p.notice.tiny', {}, 'Entries marked “D&D Beyond import” are unticked: they can contain text from published books that came with your character sheet. Keep those for your own use.') : null,
    h('p.muted.tiny', {}, 'The file can be imported into any copy of DND Infinite: Homebrew → Import, or drop it on the page.')),
  [{ label: 'Copy JSON', onClick: () => { copyText(JSON.stringify(build(), null, 2)); return false; } },
    { label: 'Download .json', primary: true, onClick: () => { const p = build(); downloadText(`${p.id}.json`, JSON.stringify(p, null, 2)); return false; } }]);
}

// ---------------------------------------------------------------- editor
let draft = null; let draftKey = null; let jsonMode = false;

function renderEditor(root, sub, go) {
  const m = sub.match(/^(new|edit)-([a-z]+)(?:-(.+))?$/);
  const type = m?.[2]; const T = TYPES[type];
  if (!T) return go('homebrew');
  const editing = m[1] === 'edit' ? m[3] : null;
  const key = `${sub}`;
  const DRAFT_KEY = `qw.hbdraft.${sub}`;
  let restored = false;
  if (draftKey !== key) {
    draftKey = key; jsonMode = !!T.json;
    const existing = editing ? (myPack().p.content[type] || []).find((e) => e.id === editing) : null;
    if (editing && !existing) { toast('Entry not found'); return go('homebrew'); }
    draft = existing ? structuredClone(fromEntry[type] ? fromEntry[type](existing) : existing) : (T.json ? structuredClone(CLASS_TEMPLATE) : {});
    if (!existing) for (const f of T.fields?.(draft) || []) if (f.def !== undefined && draft[f.k] === undefined) draft[f.k] = f.def;
    try { const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (saved && saved.name !== undefined) { draft = saved; restored = true; } } catch { /* no saved draft */ }
  }
  const persist = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage unavailable */ } };
  const discard = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };
  const rerender = () => { persist(); renderEditor(root, sub, go); };
    const startPool = (type === 'subclasses' ? all('classes').flatMap((c) => (c.subclasses || []).map((x) => ({ ...x, classId: x.classId || c.id, label: `${x.name} (${c.name})` })))
    : all(type).filter((x) => type !== 'items' || draft.type === undefined || x.type === draft.type).map((x) => ({ ...x, label: x.name })))
    .sort((a, b) => a.label.localeCompare(b.label));
  const startFrom = (id) => {
    const src = startPool.find((x) => x.id === id); if (!src) return;
    const copy = clean(structuredClone(src)); delete copy.label; delete copy.id;
    draft = fromEntry[type] ? fromEntry[type](copy) : copy;
    if (type === 'subclasses') draft.classId = src.classId;
    toast(`Started from ${src.name} — rename it and make it yours`); rerender();
  };
  const pasteDialog = () => {
    const ta = h('textarea.code', { rows: 14, placeholder: type === 'spells' ? 'Ember Lash\n1st-level evocation\nCasting Time: 1 action\nRange: 30 feet\nComponents: V, S\nDuration: Instantaneous\nDescription…\nAt Higher Levels. …'
      : type === 'subclasses' ? 'Oath of Embers\nIntro paragraph…\nBurning Vow (3rd level)\nFeature text…\nCinder Aura\nStarting at 7th level, …'
        : type === 'feats' ? 'Ember Born\nPrerequisite: Level 4+\nFeat text…' : 'Name on the first line\nThen the text…' });
    modal(`Paste ${T.label} text`, h('div', {}, h('p.muted', {}, 'Paste text copied from a PDF, wiki or GM Binder page. The first line is the name; the rest is sorted into the form, and you can fix anything afterwards.'), ta),
      [{ label: 'Cancel' }, { label: 'Fill the form', primary: true, onClick: () => { const got = parseText(type, ta.value); for (const [k, v] of Object.entries(got)) if (v !== undefined && v !== '') draft[k] = v; toast('Form filled — check the preview'); rerender(); } }]);
  };
  const fields = T.fields ? T.fields(draft) : [];

  const save = () => {
    let entry = draft;
    if (jsonMode) {
      try { entry = JSON.parse(root.querySelector('textarea.json-edit').value); } catch { toast('That JSON is not valid'); return; }
    }
    if (!entry.name?.trim()) { toast('Give it a name first'); return; }
    for (const f of fields) if (f.req && !jsonMode && (entry[f.k] === undefined || entry[f.k] === '')) { toast(`${f.label} is required`); return; }
    entry = { ...entry, id: editing || entry.id || `hb-${slug(entry.name)}` };
    // Drop blank repeating rows (an added feature/trait/action that was never filled in).
    if (!jsonMode) for (const f of fields) if (f.type === 'rows' && Array.isArray(entry[f.k])) entry[f.k] = entry[f.k].filter((r) => (r.name || r.item || '').toString().trim());
    if (!editing && (myPack().p.content[type] || []).some((e) => e.id === entry.id)) entry.id += `-${Date.now().toString(36).slice(-4)}`;
    const out = jsonMode && type === 'classes' ? entry : (toEntry[type] ? toEntry[type](entry) : entry);
    if (type === 'classes' && (!out.features || !out.hitDie)) { toast('A class needs at least "hitDie" and "features"'); return; }
    saveEntry(type, out, editing);
    discard(); draftKey = null; toast(`Saved ${out.name}`); go('homebrew');
  };

  const preview = previewOf(type, toEntry[type] ? safe(() => toEntry[type]({ ...draft, id: draft.id || 'preview' })) : draft);
  root.replaceChildren(h('div.hb-editor', {},
    h('a.linkish', { href: '#homebrew', onclick: () => { draftKey = null; } }, '‹ Back to Homebrew'),
    h('h1', {}, `${editing ? 'Edit' : 'New'} ${T.label}`),
    restored ? h('div.warnbox.small', {}, 'Restored your unsaved draft. ', h('button.linkish', { type: 'button', onclick: () => { discard(); draftKey = null; renderEditor(root, sub, go); } }, 'Discard it')) : null,
    !T.json ? h('div.editor-tools', {},
      h('label', {}, 'Start from… ', h('select', { onchange: (e) => e.target.value && startFrom(e.target.value) }, h('option', { value: '' }, `— copy an existing ${T.label.toLowerCase()} —`),
        startPool.map((x) => h('option', { value: x.id }, `${x.label}${x.source && x.source !== 'SRD' ? ` · ${x.source}` : ''}`)))),
      h('button.btn.small', { type: 'button', onclick: pasteDialog }, '📋 Paste text…'),
      h('button.btn.small', { type: 'button', title: 'Copy this entry as JSON', onclick: () => copyText(JSON.stringify(toEntry[type] ? toEntry[type]({ ...draft, id: draft.id || `hb-${slug(draft.name || 'new')}` }) : draft, null, 2)) }, 'Copy JSON')) : null,
    !T.json ? h('div.seg', {}, h(`button${!jsonMode ? '.on' : ''}`, { type: 'button', onclick: () => { jsonMode = false; rerender(); } }, 'Form'),
      h(`button${jsonMode ? '.on' : ''}`, { type: 'button', onclick: () => { jsonMode = true; rerender(); } }, 'JSON')) : null,
    h('div.editor-cols', {},
      h('form.card.hb-form', { onsubmit: (e) => { e.preventDefault(); save(); }, oninput: persist, onchange: persist },
        jsonMode
          ? [T.json ? h('p.muted', {}, 'Classes have many interlocking parts, so they are edited as JSON. Start from the template below; see docs/data-format.md for every field.') : null,
            h('textarea.code.json-edit', { rows: 26 }, JSON.stringify(jsonMode && !T.json && toEntry[type] ? toEntry[type]({ ...draft, id: draft.id || `hb-${slug(draft.name || 'new')}` }) : draft, null, 2))]
          : fields.map((f) => field(f, draft, rerender)),
        h('div.row', {}, h('button.btn.primary', { type: 'submit' }, 'Save'), h('a.btn', { href: '#homebrew', onclick: () => { discard(); draftKey = null; } }, 'Cancel'), h('span.muted.tiny', {}, 'Drafts save automatically.'))),
      !jsonMode ? h('div.hb-preview', {}, h('h3', {}, 'Preview'), preview) : null)));
}
const safe = (fn) => { try { return fn(); } catch { return {}; } };

function previewOf(type, e) {
  if (!e?.name) return h('p.muted', {}, 'Fill in the form to see a preview.');
  if (type === 'monsters') return statBlock(e);
  if (type === 'spells') return h('div', {}, h('h4', {}, e.name), h('p.muted', {}, `${e.level ? `Level ${e.level}` : 'Cantrip'} ${e.school || ''}${e.concentration ? ' · Concentration' : ''}${e.ritual ? ' · Ritual' : ''}`),
    h('p.tiny', {}, `${e.time} · ${e.range} · ${e.components} · ${e.duration}`), rich(e.desc), e.higherLevel ? h('p', {}, h('b', {}, 'Higher levels. '), e.higherLevel) : null);
  const feats = e.features || e.traits;
  return h('div', {}, h('h4', {}, e.name), e.desc ? h('p', {}, e.desc) : null, e.text ? rich(e.text) : null,
    feats?.length ? h('div.feature-list', {}, feats.map((f) => h('details.feature', { open: true }, h('summary', {}, f.level ? h('span.lv', {}, `Lv ${f.level}`) : null, f.name || '(unnamed)'), rich(f.desc || '')))) : null);
}

function field(f, obj, rerender) {
  const val = obj[f.k];
  const set = (v) => { obj[f.k] = v; if (f.rerender) rerender(); };
  const label = h('label', {}, f.label, f.req ? h('span.req', {}, ' *') : null);
  if (f.type === 'text') return h('div.field', {}, label, h('input', { value: val ?? '', placeholder: f.hint || '', oninput: (e) => set(e.target.value) }));
  if (f.type === 'textarea') return h('div.field', {}, label, h('textarea', { rows: 4, oninput: (e) => set(e.target.value) }, val ?? ''));
  if (f.type === 'number') return h('div.field', {}, label, h('input.num', { type: 'number', step: f.step || '1', value: val ?? '', style: { width: f.width || '8em' }, oninput: (e) => set(e.target.value === '' ? undefined : Number(e.target.value)) }));
  if (f.type === 'checkbox') return h('label.check-field', {}, h('input', { type: 'checkbox', checked: !!val, onchange: (e) => set(e.target.checked) }), f.label);
  if (f.type === 'select') return h('div.field', {}, label, h('select', { onchange: (e) => set(e.target.value === '' ? undefined : f.num ? Number(e.target.value) : e.target.value) },
    h('option', { value: '' }, '—'), [...f.options, ...(val !== undefined && val !== '' && !f.options.some(([v]) => String(v) === String(val)) ? [[val, String(val)]] : [])].map(([v, l]) => h('option', { value: v, selected: String(v) === String(val) }, l))));
  if (f.type === 'chips') {
    const sel = new Set(val || []);
    return h('div.field', {}, label, h('div.chips', {}, f.options.map(([v, l]) => h(`button.chip${sel.has(v) ? '.on' : ''}`, { type: 'button', disabled: !sel.has(v) && f.max && sel.size >= f.max,
      onclick: (e) => { sel.has(v) ? sel.delete(v) : sel.add(v); obj[f.k] = [...sel]; e.currentTarget.classList.toggle('on'); rerender(); } }, l))));
  }
  if (f.type === 'scores') {
    const s = val || (obj[f.k] = [10, 10, 10, 10, 10, 10]);
    return h('div.field', {}, label, h('div.score-inputs', {}, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((a, i) => h('label', {}, a, h('input.num', { type: 'number', value: s[i], oninput: (e) => { s[i] = Number(e.target.value) || 10; } })))));
  }
  if (f.type === 'item') {
    return h('select', { onchange: (e) => set(e.target.value) }, h('option', { value: '' }, '— item —'), [['weapon', 'Weapons'], ['armor', 'Armor'], ['gear', 'Gear & Tools'], ['magic-item', 'Magic Items']].map(([t, l]) =>
      h('optgroup', { label: l }, all('items').filter((i) => i.type === t).sort((a, b) => a.name.localeCompare(b.name)).map((i) => h('option', { value: i.id, selected: i.id === val }, i.name)))));
  }
  if (f.type === 'rows') {
    const rows = val || (obj[f.k] = []);
    return h('div.field', {}, label,
      h('div.hb-rows', {}, rows.map((r, i) => h('div.hb-row', {},
        h('div.hb-row-fields', {}, f.fields.map((sf) => (sf.type === 'textarea'
          ? h('textarea', { rows: 3, placeholder: sf.label, oninput: (e) => { r[sf.k] = e.target.value; } }, r[sf.k] ?? '')
          : sf.type === 'item' ? field(sf, r, rerender)
            : h('input', { type: sf.type === 'number' ? 'number' : 'text', placeholder: sf.label, value: r[sf.k] ?? sf.def ?? '', style: { width: sf.width || 'auto' }, oninput: (e) => { r[sf.k] = sf.type === 'number' ? Number(e.target.value) : e.target.value; } })))),
        h('div.hb-row-btns', {},
          i > 0 ? h('button.icon-btn', { type: 'button', title: 'Move up', onclick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; rerender(); } }, '↑') : null,
          h('button.icon-btn', { type: 'button', title: 'Remove', onclick: () => { rows.splice(i, 1); rerender(); } }, '✕'))))),
      h('button.btn.small', { type: 'button', onclick: () => { rows.push(Object.fromEntries(f.fields.map((sf) => [sf.k, sf.def ?? '']))); rerender(); } }, `+ ${f.add || 'Add'}`));
  }
  return null;
}

const CLASS_TEMPLATE = {
  name: 'My Class', hitDie: 10, primary: ['str'], saves: ['str', 'con'], tagline: 'A one-line pitch.', desc: 'What this class is about.',
  skillChoices: { count: 2, from: ['athletics', 'intimidation', 'perception', 'survival'] },
  armor: ['light', 'medium', 'shield'], weapons: ['simple', 'martial'], tools: [], asiLevels: [4, 8, 12, 16], subclassLevel: 3,
  caster: null, resources: [], choices: [{ id: 'masteries', level: 1, type: 'weapon-mastery', count: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], name: 'Weapon Mastery' }],
  equipment: [{ id: 'A', label: 'Gear', items: [['longsword', 1], ['explorers-pack', 1]], gp: 10 }, { id: 'B', label: 'Gold', items: [], gp: 100 }],
  features: [{ level: 1, name: 'First Feature', desc: 'Describe it.' }, { level: 3, name: 'My Class Subclass', desc: 'Choose a subclass.' }],
  subclasses: [],
};

// An original example pack (not SRD content) showing the pack format.
export const EXAMPLE_PACK = {
  id: 'example-powder', name: 'Example: Powder & Steel', version: '1.0.0', author: 'DND Infinite contributors', license: 'CC-BY-4.0',
  content: {
    subclasses: [{
      classId: 'fighter', id: 'powder-adept', name: 'Powder Adept', desc: 'An original example subclass: a fighter who specializes in black-powder firearms.',
      features: [
        { level: 3, name: 'Powder Training', desc: 'You gain proficiency with Tinker\'s Tools, and firearms you wield ignore the Loading property once per turn.' },
        { level: 3, name: 'Trick Shot', desc: 'When you hit with a firearm, you can force a STR save (DC 8 + PB + DEX) to knock the target Prone. Uses: Proficiency Bonus per Short Rest.' },
        { level: 7, name: 'Steady Hands', desc: 'You don\'t have Disadvantage on ranged attacks while within 5 ft of an enemy.' },
        { level: 10, name: 'Ricochet', desc: 'When you miss with a firearm, you can reroll the attack against a different creature within 10 ft of the first.' },
        { level: 15, name: 'Hair Trigger', desc: 'Roll Initiative with Advantage, and you can make one firearm attack as a Reaction when combat starts.' },
        { level: 18, name: 'Last Shot', desc: 'Once per Long Rest, a firearm hit becomes a Critical Hit.' },
      ],
    }],
    feats: [{ id: 'quick-draw', name: 'Quick Draw', category: 'general', desc: 'Draw or stow two weapons at once, and add your Proficiency Bonus to Initiative.', effects: { initiativeProf: true } }],
    items: [{ id: 'powder-horn', name: 'Powder Horn', type: 'gear', cost: 3, weight: 1, desc: 'Holds enough black powder for 20 shots.' }],
  },
};
