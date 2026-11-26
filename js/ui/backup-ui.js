// Backup & restore dialog, and the reminder banner on My Characters.
import { h, modal, toast } from './dom.js';
import { storageEntries, makeBackup, parseBackup, planRestore, lastBackup, markBackedUp, backupDue } from '../engine/backup.js';
import { allImages, restoreImage } from './sheet-style.js';
import { icon } from './icons.js';

const when = (t) => {
  if (!t) return 'never';
  const days = Math.floor((Date.now() - t) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/** Build the backup and hand it to the browser as a download. */
export async function downloadBackup() {
  const images = await allImages();
  const data = makeBackup(storageEntries(), images);
  const name = `infinity-codex-backup-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })), download: name });
    document.body.append(a); a.click(); a.remove();
  } catch { toast('Downloads are blocked here. Open the site in a normal browser tab to back up.'); return false; }
  markBackedUp();
  const s = data.summary;
  toast(`Backed up ${s.characters} character${s.characters === 1 ? '' : 's'}, ${s.packs} homebrew pack${s.packs === 1 ? '' : 's'} and ${s.images} image${s.images === 1 ? '' : 's'}`);
  return true;
}

/** Ask how to restore a backup that was read from a file, then do it. */
export function restoreDialog(backup, onDone) {
  const s = backup.summary || {};
  let mode = 'merge';
  const opt = (value, title, text) => h('label.restore-opt', {},
    h('input', { type: 'radio', name: 'restore-mode', value, checked: value === mode, onchange: () => { mode = value; } }),
    h('span', {}, h('b', {}, title), h('small', {}, text)));
  modal('Restore backup', h('div.restore', {},
    h('p', {}, `Backup from ${new Date(backup.created).toLocaleString()}: `,
      h('b', {}, `${s.characters ?? '?'} character${s.characters === 1 ? '' : 's'}`), `, ${s.packs ?? 0} homebrew pack${s.packs === 1 ? '' : 's'}, ${s.images ?? 0} image${s.images === 1 ? '' : 's'}.`),
    s.names?.length ? h('p.muted.tiny', {}, s.names.join(' · ')) : null,
    opt('merge', 'Merge with what’s here (recommended)', 'Adds characters and packs that are missing. Where both have the same one, the more recently changed copy wins. Nothing here is deleted.'),
    opt('replace', 'Replace everything here', 'This browser ends up exactly like the backup. Characters and homebrew that aren’t in the backup are deleted.')),
  [{ label: 'Cancel' }, { label: 'Restore', primary: true, onClick: () => { doRestore(backup, mode).then(onDone); } }]);
}

async function doRestore(backup, mode) {
  const current = storageEntries();
  const { writes, removes, report } = planRestore(backup, current, mode);
  try {
    for (const k of removes) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(writes)) localStorage.setItem(k, v);
  } catch { toast('Restore failed: this browser’s storage is full.'); return; }
  let imgFail = 0;
  for (const [id, url] of backup.images || []) { try { await restoreImage(id, url); } catch { imgFail++; } }
  const parts = mode === 'replace'
    ? [`Restored ${report.added} character${report.added === 1 ? '' : 's'} and ${report.packsAdded} pack${report.packsAdded === 1 ? '' : 's'}`]
    : [`${report.added} character${report.added === 1 ? '' : 's'} added`, report.updated ? `${report.updated} updated` : null, report.packsAdded ? `${report.packsAdded} pack${report.packsAdded === 1 ? '' : 's'} added` : null];
  if (imgFail) parts.push(`${imgFail} image${imgFail === 1 ? '' : 's'} couldn’t be restored`);
  sessionStorage.setItem('qw.restoreMsg', parts.filter(Boolean).join(', '));
  location.reload(); // characters and packs are cached in memory; reload so everything reads the restored data
}

/** Read a file the player picked or dropped; returns true if it was a backup. */
export async function tryBackupFile(file, onDone) {
  const text = await file.text();
  if (!/"format"\s*:\s*"infinity-codex-backup"/.test(text.slice(0, 200))) return false;
  try { restoreDialog(parseBackup(text), onDone); } catch (e) { toast(e.message); }
  return true;
}

/** The Backup & restore dialog. */
export function backupDialog(onDone) {
  const file = h('input', { type: 'file', accept: '.json,application/json', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    close();
    try { restoreDialog(parseBackup(await f.text()), onDone); } catch (err) { toast(err.message); }
  } });
  const close = modal('Backup & restore', h('div.backup', {},
    h('p', {}, 'Your characters and homebrew are saved only in this browser. Clearing browsing data, using private mode or switching to another device or browser loses them. A backup file keeps them safe and moves them anywhere.'),
    h('div.backup-card', {},
      h('div', {}, h('b', {}, 'Download a backup'), h('small', {}, `Every character, homebrew pack, portrait and setting in one file. Last backup: ${when(lastBackup())}.`)),
      h('button.btn.primary', { onclick: async () => { if (await downloadBackup()) { close(); onDone?.(); } } }, icon('download'), 'Download')),
    h('div.backup-card', {},
      h('div', {}, h('b', {}, 'Restore from a backup'), h('small', {}, 'Choose a backup file. You can merge it with what’s here or replace everything.')),
      h('label.btn.ghost.file-btn', {}, icon('upload'), 'Choose file', file))));
}

/** A reminder strip for My Characters, or null when no backup is due. */
export function backupBanner(chars, rerender) {
  const due = backupDue(chars);
  if (due == null) return null;
  try { if (Number(sessionStorage.getItem('qw.backupSnooze')) > Date.now()) return null; } catch { /* ignore */ }
  return h('div.backup-nudge', { role: 'note' },
    icon('shield'),
    h('span', {}, due === 'never' ? 'Your characters only live in this browser and haven’t been backed up yet.' : `Your last backup was ${due} days ago, and you’ve changed things since.`),
    h('button.btn.small.primary', { onclick: async () => { if (await downloadBackup()) rerender(); } }, 'Back up now'),
    h('button.linkish', { onclick: () => { try { sessionStorage.setItem('qw.backupSnooze', String(Date.now() + 864e5)); } catch { /* ignore */ } rerender(); } }, 'Later'));
}
