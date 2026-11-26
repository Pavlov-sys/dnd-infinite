import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, parseBackup, planRestore, backupDue, storageEntries } from '../js/engine/backup.js';

const ls = (o) => ({ length: Object.keys(o).length, key: (i) => Object.keys(o)[i], getItem: (k) => o[k] });

test('backups hold every qw.* entry except the unlock and images', () => {
  const e = storageEntries(ls({ 'qw.characters.v1': '[]', 'qw.unlocked': 'x', 'qw.img.a': 'data:', 'qw.packs.v1': '[]', other: '1' }));
  assert.deepEqual(Object.keys(e).sort(), ['qw.characters.v1', 'qw.packs.v1']);
});

test('merge adds missing characters, keeps the newer copy, and never deletes', () => {
  const mine = [{ id: 'a', name: 'Old A', updated: 100 }, { id: 'b', name: 'B', updated: 500 }, { id: 'local', name: 'Only here', updated: 1 }];
  const theirs = [{ id: 'a', name: 'New A', updated: 200 }, { id: 'b', name: 'Older B', updated: 300 }, { id: 'c', name: 'C', updated: 50 }];
  const backup = parseBackup(JSON.stringify(makeBackup({ 'qw.characters.v1': JSON.stringify(theirs), 'qw.dice.v1': '{"sound":false}' })));
  const { writes, removes, report } = planRestore(backup, { 'qw.characters.v1': JSON.stringify(mine), 'qw.dice.v1': '{"sound":true}' }, 'merge');
  const out = Object.fromEntries(JSON.parse(writes['qw.characters.v1']).map((c) => [c.id, c.name]));
  assert.deepEqual(out, { a: 'New A', b: 'B', local: 'Only here', c: 'C' });
  assert.deepEqual(report, { added: 1, updated: 1, kept: 1, packsAdded: 0, packsUpdated: 0 });
  assert.equal(writes['qw.dice.v1'], undefined, 'settings already here are left alone');
  assert.deepEqual(removes, []);
});

test('replace makes storage match the backup', () => {
  const backup = makeBackup({ 'qw.characters.v1': '[{"id":"x"}]' });
  const { writes, removes } = planRestore(backup, { 'qw.characters.v1': '[]', 'qw.packs.v1': '[{"id":"p"}]' }, 'replace');
  assert.deepEqual(removes, ['qw.packs.v1']);
  assert.equal(writes['qw.characters.v1'], '[{"id":"x"}]');
});

test('non-backup files are rejected with a clear message', () => {
  assert.throws(() => parseBackup('{"format":"dnd-infinite-character"}'), /isn’t an Infinity Codex backup/);
  assert.throws(() => parseBackup('nope'), /valid JSON/);
});

test('backup reminder timing', () => {
  const DAY = 86400000, now = 100 * DAY;
  assert.equal(backupDue([], 0, now), null);
  assert.equal(backupDue([{ created: now - DAY, updated: now }], 0, now), null, 'brand new characters: no nag yet');
  assert.equal(backupDue([{ created: now - 5 * DAY, updated: now }], 0, now), 'never');
  assert.equal(backupDue([{ created: 0, updated: now }], now - 20 * DAY, now), 20);
  assert.equal(backupDue([{ created: 0, updated: now - 30 * DAY }], now - 20 * DAY, now), null, 'nothing changed since the last backup');
});
