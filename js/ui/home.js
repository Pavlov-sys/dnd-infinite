// "My Characters" list.
import { h, confirmDialog, modal, toast, portraitEl } from './dom.js';
import { listCharacters, newCharacter, saveCharacter, deleteCharacter, duplicateCharacter, importCharacter } from '../engine/store.js';
import { compute } from '../engine/rules.js';
import { importDdbPdf, commitPlaceholders, discardPlaceholders } from '../engine/ddb-import.js';

export function renderHome(root, go) {
  const rerender = () => renderHome(root, go);
  const chars = listCharacters();
  const create = () => { const c = saveCharacter(newCharacter()); go(`build-${c.id}-class`); };
  const doImport = (text) => { try { const c = importCharacter(text); toast(`Imported ${c.name || 'character'}`); rerender(); return true; } catch (e) { toast(`Import failed: ${e.message}`); return false; } };

  const openSheet = (c) => go(`sheet-${c.id}`);
  const onDrop = (ev) => { const f = ev.dataTransfer?.files?.[0]; if (!f) return; ev.preventDefault(); handleFile(f, doImport, openSheet); };
  root.replaceChildren(h('div.home', { ondragover: (ev) => ev.preventDefault(), ondrop: onDrop },
    h('div.home-head', {}, h('div', {}, h('h1', {}, 'My Characters'), h('p.muted', {}, `${chars.length} character${chars.length === 1 ? '' : 's'} · saved in this browser`)),
      h('div.row', {},
        h('button.btn', { onclick: () => ddbDialog(openSheet) }, 'Import from D&D Beyond'),
        h('button.btn', { onclick: () => importDialog(doImport, openSheet) }, 'Import'),
        h('button.btn.primary', { onclick: create }, '+ Create Character'))),
    chars.length ? h('div.char-grid', {}, chars.map((c) => {
      const d = compute(c);
      return h('div.char-card', {},
        h('a.cc-main', { href: `#sheet-${c.id}` },
          portraitEl(c, 'portrait'),
          h('div', {}, h('h3', {}, c.name || 'Unnamed Adventurer'),
            h('div.muted', {}, `Level ${c.level} ${d.species?.name || ''} ${d.cls?.name || ''}`.trim()),
            d.sub ? h('div.muted.tiny', {}, d.sub.name) : null,
            d.warnings.length ? h('div.tiny.warn', {}, `${d.warnings.length} choice${d.warnings.length > 1 ? 's' : ''} left`) : h('div.tiny.ok', {}, 'Ready to play'))),
        h('div.cc-actions', {},
          h('a.btn.small', { href: `#sheet-${c.id}` }, 'View'),
          h('a.btn.small', { href: `#build-${c.id}-class` }, 'Edit'),
          h('button.btn.small', { onclick: () => { duplicateCharacter(c.id); rerender(); } }, 'Copy'),
          h('button.btn.small.danger', { onclick: () => confirmDialog('Delete character?', `${c.name || 'This character'} will be permanently deleted from this browser.`, () => { deleteCharacter(c.id); rerender(); }) }, 'Delete')));
    })) : h('div.empty', {},
      h('div.empty-art', {}, '⚔'), h('h2', {}, 'No adventurers yet'),
      h('p', {}, 'Build a character step by step. Every choice explains what it does, and the sheet calculates everything for you.'),
      h('button.btn.primary.big', { onclick: create }, 'Create your first character'),
      h('p', {}, h('button.linkish', { onclick: () => ddbDialog(openSheet) }, 'Or bring a character over from D&D Beyond ›')))));
}

function importDialog(doImport, openSheet) {
  const ta = h('textarea.code', { rows: 10, placeholder: 'Paste exported character JSON here…' });
  let close;
  const file = h('input', { type: 'file', accept: '.json,application/json,.pdf,application/pdf', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (isPdf(f)) { close?.(); handleFile(f, doImport, openSheet); } else ta.value = await f.text();
  } });
  close = modal('Import character', h('div', {},
    h('div.field', {}, h('label', {}, 'From a file'), file, h('div.muted.tiny', {}, 'A DND Infinite .json file, or a D&D Beyond character sheet PDF.')),
    h('div.field', {}, h('label', {}, 'Or paste JSON'), ta)),
  [{ label: 'Cancel' }, { label: 'Import', primary: true, onClick: () => doImport(ta.value) }]);
}

const isPdf = (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
async function handleFile(f, doImport, openSheet) {
  if (isPdf(f)) return previewDdb(f, openSheet);
  doImport(await f.text());
}

const IMPORT_WARNING = () => h('div.import-warning', { role: 'note' }, h('b', {}, '⚠ The import isn\'t perfect.'),
  ' Some information may be missing or come across differently. After importing, compare the character with your D&D Beyond sheet and add or fix anything that\'s missing or wrong in the builder (or on the Homebrew page for placeholder content).');

/** Step 1: explain how to get the PDF out of D&D Beyond, then take the file. */
function ddbDialog(openSheet) {
  let close;
  const pick = (f) => { if (!f) return; close(); previewDdb(f, openSheet); };
  const file = h('input', { type: 'file', accept: '.pdf,application/pdf', onchange: (e) => pick(e.target.files[0]) });
  const drop = h('div.drop-zone', {
    ondragover: (ev) => { ev.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: (ev) => { ev.preventDefault(); ev.stopPropagation(); drop.classList.remove('over'); pick(ev.dataTransfer.files[0]); },
  }, h('div', {}, '⇪ Drop the character sheet PDF here'), h('div.muted.tiny', {}, 'or'), file);
  close = modal('Import from D&D Beyond', h('div', {},
    h('div.how-to', {}, h('b', {}, 'Get the PDF from D&D Beyond'),
      h('ol', {},
        h('li', {}, 'Open your character on dndbeyond.com.'),
        h('li', {}, 'Click ', h('b', {}, 'Manage'), ' (next to the portrait), then ', h('b', {}, 'Export to PDF'), '.'),
        h('li', {}, 'When it\'s ready, download the PDF and choose it below.'))),
    drop,
    IMPORT_WARNING(),
    h('p.muted.tiny', {}, 'The file is read in your browser and never uploaded. Classes, spells, feats and items are matched against the content you have turned on; anything your content doesn\'t have becomes a placeholder in My Homebrew.')),
  [{ label: 'Cancel' }]);
}

/** Step 2: read the PDF, show what matched, then save. */
async function previewDdb(file, openSheet) {
  const body = h('div.ddb-report', {}, h('p.muted', {}, `Reading ${file.name}…`));
  let result = null;
  const close = modal('Import from D&D Beyond', body, [
    { label: 'Cancel' },
    { label: 'Import character', primary: true, onClick: () => {
      if (!result) return false;
      commitPlaceholders(result.placeholders);
      const c = saveCharacter(result.character); toast(`Imported ${c.name} — check it against your D&D Beyond sheet`); openSheet(c);
    } },
  ], { onClose: () => discardPlaceholders() });
  try {
    result = await importDdbPdf(await file.arrayBuffer());
  } catch (e) {
    body.replaceChildren(h('p.warn', {}, `Couldn't import this file: ${e.message}`));
    return close;
  }
  const r = result.report;
  const li = (items, fmt) => h('ul', {}, items.map((x) => h('li', {}, fmt(x))));
  const group = (title, items) => items.length ? h('details', { open: items.length <= 6 }, h('summary', {}, h('b', {}, `${title} (${items.length})`)), li(items, (x) => x)) : null;
  const byKind = (list) => { const m = {}; for (const x of list) (m[x.kind] ||= []).push(x); return m; };
  const matchedKinds = byKind(r.matched);
  const uniqItems = [...new Set(r.unmatchedItems)];
  body.replaceChildren(...[
    IMPORT_WARNING(),
    h('div.ddb-head', {}, portraitEl(result.character, 'portrait'), h('div', {}, h('h3', {}, r.name), h('div.muted', {}, r.summary))),
    h('div.ddb-stat', {},
      h('span.ok', {}, `${r.matched.length} matched`),
      r.created.length ? h('span.warn', {}, `${r.created.length} placeholder${r.created.length > 1 ? 's' : ''}`) : null,
      r.approx.length ? h('span.warn', {}, `${r.approx.length} approximate`) : null,
      r.missing.length ? h('span.bad', {}, `${r.missing.length} not in your content`) : null,
      uniqItems.length ? h('span.warn', {}, `${uniqItems.length} custom item${uniqItems.length > 1 ? 's' : ''}`) : null,
      h(r.diffs.length ? 'span.warn' : 'span.ok', {}, r.diffs.length ? `${r.diffs.length} number${r.diffs.length > 1 ? 's' : ''} differ` : 'All numbers match the sheet')),
    r.warnings.length ? h('div.notice', {}, r.warnings.map((w) => h('div', {}, w))) : null,
    r.created.length ? h('div.notice', {}, h('b', {}, 'New placeholders for content you don\'t have'),
      li(r.created, (x) => [h('b', {}, `${x.kind}: `), x.name]),
      h('div.muted.tiny', {}, 'Each one is built from the sheet (features text, proficiencies, hit die, spell slots, speed…) and saved to My Homebrew, marked “D&D Beyond import”. They work in the builder and compendium like anything else; edit them on the Homebrew page to fill in what the PDF leaves out, like spell descriptions or feature levels.')) : null,
    r.reused.length ? h('div', {}, h('b', {}, 'Reusing placeholders from earlier imports'), li(r.reused, (x) => `${x.kind}: ${x.name}`)) : null,
    r.missing.length ? h('div', {}, h('b', {}, 'Not in your content'), li(r.missing, (m) => [h('b', {}, `${m.kind}: ${m.name}`), m.detail ? h('span.muted', {}, ` — ${m.detail}`) : null])) : null,
    r.approx.length ? h('div', {}, h('b', {}, 'Matched by name only'), li(r.approx, (m) => [`${m.from} → ${m.to} (${m.source})`, m.why ? h('span.muted', {}, ` — ${m.why}`) : null])) : null,
    r.diffs.length ? h('div', {}, h('b', {}, 'Numbers that differ from the D&D Beyond sheet'), li(r.diffs, (x) => `${x.label}: D&D Beyond ${x.sheet}, here ${x.ours}`)) : null,
    r.notes.length ? h('div', {}, li(r.notes, (x) => h('span.muted', {}, x))) : null,
    uniqItems.length ? group('Kept as custom items', uniqItems) : null,
    h('div', {}, h('b', {}, 'Matched'), Object.entries(matchedKinds).map(([k, list]) => group(k === 'Class' || k === 'Subclass' || k === 'Species' || k === 'Background' ? k : `${k}s`, list.map((m) => (m.from === m.to ? m.to : `${m.from} → ${m.to}`))))),
    h('p.muted.tiny', {}, 'Your ability scores are imported exactly as shown on the sheet. Multiclass levels DND Infinite can\'t model yet are kept in the Notes tab.'),
  ].filter(Boolean));
  return close;
}
