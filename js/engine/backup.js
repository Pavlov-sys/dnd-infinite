// Backup and restore: everything this browser holds for Infinity Codex, in one JSON file.
// Saved: every `qw.*` localStorage entry (characters, homebrew packs, which built-in packs are on,
// sheet defaults, dice settings, builder drafts) and every uploaded image (portraits, sheet backgrounds,
// pack covers). Not saved: the passkey unlock, which belongs to the device.

export const BACKUP_FORMAT = 'infinity-codex-backup';
const LAST_KEY = 'qw.lastBackup';
const CHAR_KEY = 'qw.characters.v1';
const PACKS_KEY = 'qw.packs.v1';
const SKIP = new Set(['qw.unlocked', LAST_KEY]);

/** All storage entries that belong in a backup. */
export function storageEntries(ls = localStorage) {
  const out = {};
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith('qw.') && !SKIP.has(k) && !k.startsWith('qw.img.')) out[k] = ls.getItem(k);
  }
  return out;
}

export function makeBackup(entries, images = []) {
  const chars = safeParse(entries[CHAR_KEY], []);
  const packs = safeParse(entries[PACKS_KEY], []);
  return {
    format: BACKUP_FORMAT, formatVersion: 1, created: new Date().toISOString(),
    summary: { characters: chars.length, packs: packs.length, images: images.length, names: chars.map((c) => c.name || 'Unnamed').slice(0, 50) },
    storage: entries, images,
  };
}

export function parseBackup(text) {
  let data; try { data = JSON.parse(text); } catch { throw new Error('That file isn’t a backup (it isn’t valid JSON).'); }
  if (data?.format !== BACKUP_FORMAT || typeof data.storage !== 'object') throw new Error('That file isn’t an Infinity Codex backup. Single characters and homebrew packs are imported from their own Import buttons.');
  return data;
}

function safeParse(t, fb) { try { return t == null ? fb : JSON.parse(t); } catch { return fb; } }
const toTime = (t) => (typeof t === 'number' ? t : Date.parse(t || '') || 0);
const stamp = (c) => Math.max(c.updated || 0, c.lastUsed || 0, c.created || 0);

/**
 * Work out what restoring would write. mode 'merge' keeps what's here and adds or updates from the
 * backup (for characters and packs the newer copy wins); mode 'replace' makes this browser match the
 * backup exactly. Returns { writes: {key: value}, removes: [keys], report }.
 */
export function planRestore(backup, current, mode = 'merge') {
  const writes = {}; const removes = [];
  const report = { added: 0, updated: 0, kept: 0, packsAdded: 0, packsUpdated: 0 };
  if (mode === 'replace') {
    for (const k of Object.keys(current)) if (!(k in backup.storage)) removes.push(k);
    Object.assign(writes, backup.storage);
    report.added = safeParse(backup.storage[CHAR_KEY], []).length;
    report.packsAdded = safeParse(backup.storage[PACKS_KEY], []).length;
    return { writes, removes, report };
  }
  for (const [k, v] of Object.entries(backup.storage)) {
    if (k === CHAR_KEY) {
      const mine = safeParse(current[k], []); const theirs = safeParse(v, []);
      const byId = new Map(mine.map((c) => [c.id, c]));
      for (const c of theirs) {
        const have = byId.get(c.id);
        if (!have) { byId.set(c.id, c); report.added++; } else if (stamp(c) > stamp(have)) { byId.set(c.id, c); report.updated++; } else report.kept++;
      }
      writes[k] = JSON.stringify([...byId.values()]);
    } else if (k === PACKS_KEY) {
      const mine = safeParse(current[k], []); const theirs = safeParse(v, []);
      const byId = new Map(mine.map((p) => [p.id, p]));
      for (const p of theirs) {
        const have = byId.get(p.id);
        if (!have) { byId.set(p.id, p); report.packsAdded++; } else if (toTime(p.updated) > toTime(have.updated)) { byId.set(p.id, p); report.packsUpdated++; }
      }
      writes[k] = JSON.stringify([...byId.values()]);
    } else if (!(k in current)) writes[k] = v; // settings: only fill in what this browser doesn't have
  }
  return { writes, removes, report };
}

export const lastBackup = () => { try { return Number(localStorage.getItem(LAST_KEY)) || 0; } catch { return 0; } };
export const markBackedUp = () => { try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* ignore */ } };

/**
 * Whether to nudge the player: they have characters, and either never backed up (and the oldest
 * character is over 3 days old) or the last backup is over 14 days old and something changed since.
 */
export function backupDue(chars, last = lastBackup(), now = Date.now()) {
  if (!chars.length) return null;
  const DAY = 86400000;
  const newest = Math.max(...chars.map((c) => c.updated || 0));
  if (!last) { const oldest = Math.min(...chars.map((c) => c.created || now)); return now - oldest > 3 * DAY ? 'never' : null; }
  return now - last > 14 * DAY && newest > last ? Math.floor((now - last) / DAY) : null;
}
