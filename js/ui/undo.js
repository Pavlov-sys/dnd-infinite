// Undo for the character sheet. Every change made through the sheet saves a snapshot first; the
// Undo pop-up (or Ctrl+Z / Cmd+Z) puts the character back exactly as it was, one step at a time.
import { h } from './dom.js';
import { icon } from './icons.js';

const LIMIT = 40;
let stack = []; let owner = null; // one history, for the character currently open
let hideTimer = null;

/** Describe what changed between two snapshots, in a few words ("HP 30 → 22"). */
export function describeChange(a, b, hpMax) {
  const out = [];
  const hpA = a.hp?.current ?? hpMax ?? 'full', hpB = b.hp?.current ?? hpMax ?? 'full';
  if (hpA !== hpB) out.push(`HP ${hpA} → ${hpB}`);
  if ((a.hp?.temp || 0) !== (b.hp?.temp || 0)) out.push(`Temp HP ${a.hp?.temp || 0} → ${b.hp?.temp || 0}`);
  const sum = (o) => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const slotsA = sum(a.used?.slots) + (a.used?.pact || 0), slotsB = sum(b.used?.slots) + (b.used?.pact || 0);
  if (slotsA !== slotsB) out.push(slotsB > slotsA ? 'Spell slot used' : 'Spell slot restored');
  const resA = sum(a.used?.resources), resB = sum(b.used?.resources);
  if (resA !== resB) out.push(resB > resA ? 'Feature use spent' : 'Feature use restored');
  if ((a.exhaustion || 0) !== (b.exhaustion || 0)) out.push(`Exhaustion ${a.exhaustion || 0} → ${b.exhaustion || 0}`);
  if (JSON.stringify(a.deathSaves) !== JSON.stringify(b.deathSaves)) out.push('Death saves');
  if (JSON.stringify(a.conditions) !== JSON.stringify(b.conditions)) out.push('Conditions');
  if (!!a.heroicInspiration !== !!b.heroicInspiration) out.push(`Heroic Inspiration ${b.heroicInspiration ? 'gained' : 'spent'}`);
  if (JSON.stringify(a.currency) !== JSON.stringify(b.currency)) out.push('Coins');
  if (JSON.stringify(a.inventory) !== JSON.stringify(b.inventory)) out.push('Inventory');
  if (JSON.stringify(a.spells) !== JSON.stringify(b.spells) || JSON.stringify(a.extras?.spells) !== JSON.stringify(b.extras?.spells)) out.push('Spells');
  if (JSON.stringify(a.custom) !== JSON.stringify(b.custom)) out.push('Adjustments');
  if (a.level !== b.level) out.push(`Level ${a.level} → ${b.level}`);
  return out.length ? out.slice(0, 2).join(' · ') + (out.length > 2 ? ' …' : '') : 'Change';
}

// Fields that change on their own (timestamps) don't count as a change worth undoing.
const comparable = (c) => JSON.stringify({ ...c, updated: 0, lastUsed: 0 });

/**
 * Run `fn` on the character, keeping a snapshot so it can be undone. `label` overrides the
 * automatic description (e.g. "Long Rest"). Returns true if anything changed.
 */
export function recordChange(c, fn, label, hpMax) {
  if (owner !== c.id) { stack = []; owner = c.id; }
  const before = structuredClone(c);
  fn(c);
  if (comparable(before) === comparable(c)) return false;
  stack.push({ snap: before, label: label || describeChange(before, c, hpMax) });
  if (stack.length > LIMIT) stack.shift();
  return true;
}

export const canUndo = (c) => owner === c.id && stack.length > 0;

/** Put the character back to before its last change. Returns the step's label, or null. */
export function undoLast(c) {
  if (!canUndo(c)) return null;
  const { snap, label } = stack.pop();
  for (const k of Object.keys(c)) delete c[k];
  Object.assign(c, snap);
  return label;
}

/** Show (or refresh) the Undo pop-up for the latest change. */
export function showUndo(label, onUndo, remaining) {
  let el = document.getElementById('undo-toast');
  if (!el) { el = h('div', { id: 'undo-toast', role: 'status' }); document.body.append(el); }
  el.replaceChildren(
    h('span.ut-label', {}, label),
    h('button.ut-btn', { onclick: onUndo, title: 'Undo (Ctrl+Z)' }, icon('undo'), 'Undo', remaining > 1 ? h('small', {}, `${remaining}`) : null));
  el.classList.add('show');
  clearTimeout(hideTimer); hideTimer = setTimeout(hideUndo, 7000);
}
export function hideUndo() { document.getElementById('undo-toast')?.classList.remove('show'); }

export const undoDepth = () => stack.length;
export const lastLabel = () => stack[stack.length - 1]?.label || 'Change';
