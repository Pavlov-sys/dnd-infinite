// Compendium → Library: every content pack on a shelf — your own homebrew packs, packs you imported
// from a .json file, and the built-in books. Open one to see what's inside, switch it on or off,
// download it to share, or browse its entries in the compendium.
import { h, toast, copyText, downloadText, confirmDialog, rich } from './dom.js';
import { loadPacks, savePacks, rebuild, SRD_PACK, BUILTIN_PACKS, isBuiltinEnabled, setBuiltinEnabled, all } from '../data/index.js';
import { ownPacks, importDialog, TYPES } from './homebrew.js';
import { BOOK_COVERS } from '../data/covers.js';

export const PACK_COLORS = ['#c53131', '#8e2b8f', '#2b5fb4', '#1f7a6d', '#3f7d2e', '#b8761b', '#6b4b2a', '#3a3f4a'];
const MY = 'my-homebrew';
const KIND_ORDER = ['classes', 'subclasses', 'species', 'backgrounds', 'feats', 'spells', 'items', 'monsters'];
const KIND_LABEL = { classes: ['class', 'classes'], subclasses: ['subclass', 'subclasses'], species: ['species', 'species'], backgrounds: ['background', 'backgrounds'], feats: ['feat', 'feats'], spells: ['spell', 'spells'], items: ['item', 'items'], monsters: ['monster', 'monsters'] };
// Which compendium tab shows each kind.
const KIND_TAB = { classes: 'classes', subclasses: 'subclasses', species: 'species', backgrounds: 'backgrounds', feats: 'feats', spells: 'spells', items: 'items', monsters: 'monsters' };

/** A stable cover colour: the pack's own, else one picked from its id. */
export function packColor(p) {
  if (p.color) return p.color;
  let n = 0; for (const ch of String(p.id || p.name || '')) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return PACK_COLORS[n % PACK_COLORS.length];
}
const counts = (p) => (p.counts ? Object.entries(p.counts) : Object.entries(p.content || {}).map(([k, v]) => [k, v.length])).filter(([, n]) => n);
export function countLabel(p) { return counts(p).sort((a, b) => KIND_ORDER.indexOf(a[0]) - KIND_ORDER.indexOf(b[0])).map(([k, n]) => `${n.toLocaleString()} ${KIND_LABEL[k]?.[n === 1 ? 0 : 1] || k}`).join(', '); }
const initials = (name) => String(name || '?').replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w) && !/^(of|the|and|a|an)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

/** The book cover drawn for a pack. */
export function packCover(p, { small = false, badge } = {}) {
  const c = packColor(p);
  const img = p.cover || BOOK_COVERS[p.id]?.src;
  const titled = p.coverTitle !== false;
  return h(`div.book${small ? '.small' : ''}${img ? '.has-img' : ''}${img && !titled ? '.img-only' : ''}`, { style: `--pc:${c}`, title: img && BOOK_COVERS[p.id] && !p.cover ? `Cover: ${BOOK_COVERS[p.id].credit}` : undefined },
    img ? h('img.book-img', { src: img, alt: '', loading: 'lazy' }) : null,
    h('div.book-spine'),
    h('div.book-face', {},
      img ? null : h('div.book-mono', { 'aria-hidden': 'true' }, initials(p.name)),
      h('div.book-title', {}, p.name || 'Untitled pack'),
      p.author ? h('div.book-author', {}, `by ${p.author}`) : null,
      h('div.book-meta', {}, [p.version ? `v${p.version}` : null, countLabel(p) || 'Empty'].filter(Boolean).join(' · ')),
      badge ? h('span.book-badge', {}, badge) : null));
}

/** A pack as it goes into a shared .json file. */
export function exportablePack(p, { keepDdb = false } = {}) {
  const content = {};
  for (const [k, v] of Object.entries(p.content || {})) {
    const list = (keepDdb ? v : v.filter((e) => e.imported !== 'ddb')).map(({ source, packId, ...e }) => e);
    if (list.length) content[k] = list;
  }
  const { enabled, own, imported, counts: _c, ...meta } = p;
  return { format: 'dnd-infinite-pack', formatVersion: 1, ...meta, id: p.id === MY ? `${MY}-${Date.now().toString(36).slice(-4)}` : p.id, exported: new Date().toISOString(), content };
}

// ---------------------------------------------------------------- shelf
function allShelves() {
  const mine = ownPacks().map((p) => ({ ...p, kind: 'own' }));
  const imported = loadPacks().filter((p) => !p.own && p.id !== MY).map((p) => ({ ...p, kind: 'imported' }));
  const srd = { ...SRD_PACK, kind: 'core', name: 'Core Rules (SRD 5.2)', author: 'Wizards of the Coast', license: 'CC-BY-4.0', color: '#242528', description: 'The 2024 System Reference Document: the rules, classes, species, spells, items and monsters everyone can use.', counts: Object.fromEntries(KIND_ORDER.map((k) => [k, k === 'subclasses' ? (SRD_PACK.content.classes || []).reduce((n, c) => n + (c.subclasses?.length || 0), 0) : (SRD_PACK.content[k] || []).length])) };
  const books = BUILTIN_PACKS.map((b) => ({ ...b, kind: 'builtin', author: b.sources?.join(', '), enabled: isBuiltinEnabled(b) }));
  return { mine, imported, books: [srd, ...books] };
}
const findPack = (id) => { const s = allShelves(); return [...s.mine, ...s.imported, ...s.books].find((p) => p.id === id); };

function enableToggle(p, rerender) {
  if (p.kind === 'core') return h('span.pill.on-pill', {}, 'Always on');
  if (p.kind === 'builtin') return h('label.toggle', {}, h('input', { type: 'checkbox', checked: p.enabled, onchange: (ev) => { setBuiltinEnabled(p.id, ev.target.checked); toast('Reloading content…'); setTimeout(() => location.reload(), 300); } }), ' On');
  return h('label.toggle', { title: 'Off: its content is hidden from the builder and compendium' }, h('input', { type: 'checkbox', checked: p.enabled !== false, onchange: (ev) => { savePacks(loadPacks().map((x) => (x.id === p.id ? { ...x, enabled: ev.target.checked } : x)).concat(p.id === MY && !loadPacks().some((x) => x.id === MY) ? [{ ...p, enabled: ev.target.checked }] : [])); rebuild(); rerender(); } }), ' On');
}
const download = (p) => { const out = exportablePack(p); downloadText(`${out.id}.json`, JSON.stringify(out, null, 2)); toast(`Downloaded ${p.name}`); };

export function renderLibrary(host, packId, browse) {
  const rerender = () => renderLibrary(host, packId, browse);
  if (packId) return renderPack(host, packId, browse, rerender);
  const { mine, imported, books } = allShelves();
  const shelf = (title, note, packs) => h('section.shelf', {},
    h('div.shelf-head', {}, h('div', {}, h('h2', {}, title), h('p.muted.tiny', {}, note))),
    h('div.cover-grid', {}, packs.map((p) => h(`div.cover-card${p.enabled === false ? '.off' : ''}`, {},
      h('a.cover-btn', { href: `#compendium-library-${p.id}`, title: `Open ${p.name}` }, packCover(p, { badge: p.kind === 'own' ? 'Yours' : p.license || null })),
      h('div.cover-acts', {}, enableToggle(p, rerender),
        p.kind === 'own' || p.kind === 'imported' ? h('button.btn.small', { onclick: () => download(p), disabled: !countLabel(p) }, '⇩ .json') : null))),
    packs.length ? null : h('p.muted.empty-shelf', {}, title === 'Your homebrew' ? h('span', {}, 'No packs yet. ', h('a', { href: '#homebrew' }, 'Make one in Homebrew.')) : 'Nothing here yet.')));
  const page = h('div.library', {},
    h('div.lib-head', {},
      h('div', {}, h('h2', {}, 'Library'), h('p.muted', {}, 'Every content pack you have: your homebrew, packs shared with you, and the built-in books. Share a pack by downloading its .json file; anyone can import it here.')),
      h('button.btn', { onclick: () => importDialog(null, rerender) }, '⇪ Import pack')),
    h('div.drop-hint', {}, 'Drop a pack’s .json file anywhere here to import it.'),
    shelf('Your homebrew', 'Packs you made. Create and edit them in Homebrew.', mine),
    shelf('Shared with you', 'Packs imported from a .json file. Import a newer version of the same pack to update it.', imported),
    shelf('Books', 'The core rules and openly licensed books (OGL 1.0a or CC-BY-4.0). Switching one on or off reloads the page.', books));
  page.addEventListener('dragover', (ev) => { ev.preventDefault(); page.classList.add('dragging'); });
  page.addEventListener('dragleave', (ev) => { if (ev.target === page) page.classList.remove('dragging'); });
  page.addEventListener('drop', async (ev) => { ev.preventDefault(); page.classList.remove('dragging'); const f = ev.dataTransfer.files[0]; if (f) importDialog({ text: await f.text(), name: f.name.replace(/\.json$/i, '') }, rerender); });
  host.replaceChildren(page);
}

// ---------------------------------------------------------------- one pack
function renderPack(host, id, browse, rerender) {
  const p = findPack(id);
  if (!p) { host.replaceChildren(h('div.library', {}, h('a.linkish', { href: '#compendium-library' }, '‹ Library'), h('p.muted', {}, 'That pack isn’t in your library any more.'))); return; }
  const on = p.kind === 'core' || p.enabled !== false;
  // Entries: from the pack itself for homebrew; from the loaded content for built-in books (when on).
  const entriesOf = (k) => (p.kind === 'own' || p.kind === 'imported' ? (p.content?.[k] || [])
    : !on ? [] : k === 'subclasses' ? all('classes').flatMap((c) => (c.subclasses || []).filter((s) => s.packId === p.id)) : all(k).filter((e) => e.packId === p.id));
  const kinds = KIND_ORDER.filter((k) => entriesOf(k).length || (p.counts?.[k] && !on));
  const actions = [
    enableToggle(p, rerender),
    p.kind === 'own' ? h('a.btn.small', { href: '#homebrew', onclick: () => { try { sessionStorage.setItem('qw.hbpack', p.id); } catch { /* ignore */ } } }, '✎ Edit in Homebrew') : null,
    p.kind === 'own' || p.kind === 'imported' ? [
      h('button.btn.small.primary', { onclick: () => download(p), disabled: !countLabel(p) }, '⇩ Download .json'),
      h('button.btn.small', { title: 'Copy the pack as JSON to paste somewhere', onclick: () => copyText(JSON.stringify(exportablePack(p), null, 2)) }, 'Copy JSON')] : null,
    p.kind === 'imported' ? h('button.btn.small', { title: 'Copy every entry into your Homebrew so you can change them', onclick: () => importDialog({ text: JSON.stringify(exportablePack(p)), name: p.name }, rerender) }, 'Make an editable copy…') : null,
    p.kind === 'imported' ? h('button.btn.small.danger', { onclick: () => confirmDialog(`Remove ${p.name}?`, 'Characters that use its content will lose those options. You can import the file again later.', () => { savePacks(loadPacks().filter((x) => x.id !== p.id)); rebuild(); location.hash = '#compendium-library'; }, 'Remove') }, 'Remove') : null,
  ].flat().filter(Boolean);
  const meta = [p.author ? ['Author', p.author] : null, p.version ? ['Version', p.version] : null, p.license ? ['License', p.license] : null,
    p.updated || p.imported ? [p.imported ? 'Imported' : 'Updated', new Date(p.updated || p.imported).toLocaleDateString()] : null].filter(Boolean);
  host.replaceChildren(h('div.library', {},
    h('a.linkish', { href: '#compendium-library' }, '‹ Library'),
    h('div.pack-hero', {},
      packCover(p),
      h('div.pack-info', {},
        h('h1', {}, p.name),
        p.description ? h('div.pack-desc', {}, rich(p.description)) : null,
        meta.length ? h('dl.pack-meta', {}, meta.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null,
        h('div.row.wrap', {}, actions),
        !on ? h('p.notice.tiny', {}, 'This pack is switched off, so its content is hidden from the builder and the rest of the compendium. Switch it on to use it.') : null)),
    kinds.length ? kinds.map((k) => {
      const list = entriesOf(k).slice().sort((a, b) => a.name.localeCompare(b.name));
      const n = list.length || p.counts?.[k] || 0;
      return h('section.pack-kind', {},
        h('div.row.between', {}, h('h3', {}, `${TYPES[k]?.icon || ''} ${n.toLocaleString()} ${KIND_LABEL[k][n === 1 ? 0 : 1]}`),
          on && list.length ? h('button.btn.small', { onclick: () => browse(KIND_TAB[k], p.id) }, 'Browse in compendium ›') : null),
        list.length ? h('div.chip-cloud', {}, list.slice(0, 80).map((e) => (on
          ? h('button.chip', { type: 'button', title: `Open ${e.name}`, onclick: () => browse(KIND_TAB[k], p.id, e.name) }, e.name)
          : h('span.chip.off', {}, e.name))), list.length > 80 ? h('span.muted.tiny', {}, ` and ${list.length - 80} more`) : null) : h('p.muted.tiny', {}, 'Switch the book on to see its entries.'));
    }) : h('p.muted.center', {}, p.kind === 'own' ? 'This pack is empty. Add content to it in Homebrew.' : 'This pack has no content.')));
}
