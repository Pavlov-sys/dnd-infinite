// Ammunition and consumables: which ammunition a weapon fires, which inventory entry holds it,
// and what using a consumable does. Pure functions, so the sheet and the tests share them.

// ------------------------------------------------------------------ ammunition
const AMMO_NAMES = { arrows: 'Arrows', bolts: 'Bolts', 'bullets-sling': 'Sling Bullets', 'bullets-firearm': 'Firearm Bullets', needles: 'Needles' };
export const ammoName = (kind) => AMMO_NAMES[kind] || kind;

/** The ammunition a weapon fires ('arrows', 'bolts'…), or null for weapons without the Ammunition property. */
export function ammoForWeapon(w) {
  if (!w || !(w.props || []).some((p) => /^ammunition/i.test(p))) return null;
  const n = `${w.id || ''} ${w.name || ''}`.toLowerCase();
  if (/crossbow/.test(n)) return 'bolts';
  if (/bow/.test(n)) return 'arrows';
  if (/sling/.test(n)) return 'bullets-sling';
  if (/blowgun/.test(n)) return 'needles';
  if (/pistol|musket|rifle|firearm|gun/.test(n)) return 'bullets-firearm';
  return null;
}

/** Which kind of ammunition an inventory item is, if any (matches SRD ids and imported names like "Arrows (20)"). */
export function ammoKindOfItem(it) {
  if (!it) return null;
  if (AMMO_NAMES[it.id]) return it.id;
  if (it.type === 'weapon') return null;
  const n = String(it.name || '').toLowerCase();
  if (/\barrows?\b/.test(n)) return 'arrows';
  if (/\bbolts?\b/.test(n)) return 'bolts';
  if (/needles?/.test(n)) return 'needles';
  if (/bullets?/.test(n)) return /firearm|pistol|musket/.test(n) ? 'bullets-firearm' : 'bullets-sling';
  return null;
}

/** The inventory entries (computed, with .item and .idx) holding a kind of ammunition, fullest first. */
export const ammoEntries = (inv, kind) => inv.filter((e) => ammoKindOfItem(e.item) === kind && e.qty > 0).sort((a, b) => b.qty - a.qty);
export const ammoCount = (inv, kind) => inv.filter((e) => ammoKindOfItem(e.item) === kind).reduce((s, e) => s + (Number(e.qty) || 0), 0);

/** Spend one piece of ammunition (mutates the character). Returns pieces left, or -1 if there was none. */
export function spendAmmo(c, inv, kind) {
  const e = ammoEntries(inv, kind)[0];
  if (!e) return -1;
  c.inventory[e.idx].qty -= 1; // the entry stays at 0 so recovered ammunition has somewhere to go
  c.used.ammo = { ...(c.used.ammo || {}), [kind]: ((c.used.ammo || {})[kind] || 0) + 1 };
  return ammoCount(inv, kind) - 1;
}

/** After a fight you recover half the ammunition you fired (2024 rules), rounded down. Returns how many came back. */
export function recoverAmmo(c, inv, kind) {
  const spent = (c.used.ammo || {})[kind] || 0;
  const back = Math.floor(spent / 2);
  const e = inv.find((x) => ammoKindOfItem(x.item) === kind);
  if (e && back) c.inventory[e.idx].qty = (Number(c.inventory[e.idx].qty) || 0) + back;
  c.used.ammo = { ...(c.used.ammo || {}) }; delete c.used.ammo[kind];
  return back;
}

// ------------------------------------------------------------------ consumables
const HEALING = [[/supreme healing/i, '10d4+20', 'Potion of Supreme Healing'], [/superior healing/i, '8d4+8', 'Potion of Superior Healing'], [/greater healing/i, '4d4+4', 'Potion of Greater Healing']];

/**
 * What using an item does: { kind: 'heal', dice } for healing potions, { kind: 'damage', dice, dtype, save }
 * for thrown flasks, { kind: 'use' } for anything else that is used up (potions, oils, scrolls, rations…),
 * or null for items that aren't consumed.
 */
export function consumableOf(it) {
  if (!it) return null;
  const id = it.id || ''; const name = String(it.name || '');
  if (/potions? of (\w+ )?healing|^potion-of-healing$|potions-of-healing/i.test(`${name} ${id}`) && !/poison/i.test(name)) {
    const tier = HEALING.find(([re]) => re.test(name));
    return { kind: 'heal', dice: tier ? tier[1] : '2d4+2', action: 'Bonus Action' };
  }
  if (id === 'acid' || /^acid( \(vial\))?$/i.test(name)) return { kind: 'damage', dice: '2d6', dtype: 'acid', save: 'dex', action: 'replaces one attack' };
  if (id === 'alchemists-fire' || /^alchemist'?s fire/i.test(name)) return { kind: 'damage', dice: '1d4', dtype: 'fire', save: 'dex', action: 'replaces one attack', note: 'and the target has the Burning condition' };
  if (id === 'holy-water' || /^holy water/i.test(name)) return { kind: 'damage', dice: '2d8', dtype: 'radiant', save: 'dex', action: 'replaces one attack', note: 'if it is a Fiend or Undead' };
  if (['antitoxin', 'rations', 'oil'].includes(id) || /^(antitoxin|rations?)\b/i.test(name)) return { kind: 'use' };
  if (it.type === 'magic-item' && /^(potions|scrolls)$/i.test(it.category || '')) return { kind: 'use' };
  if (/\b(potion|elixir|philter|spell scroll)\b|^oil of /i.test(name)) return { kind: 'use' };
  return null;
}

/** Use one of inventory entry `idx` (mutates). Returns what's left; the entry goes once it's empty. */
export function useOne(c, idx) {
  const e = c.inventory[idx]; if (!e) return 0;
  e.qty = Math.max(0, (Number(e.qty) || 1) - 1);
  const left = e.qty;
  if (!left) c.inventory.splice(idx, 1);
  return left;
}

/** Double the dice of a damage expression for a critical hit: "2d6+3" → "4d6+3". */
export const critDice = (expr) => String(expr).replace(/(\d+)d(\d+)/g, (_, n, s) => `${Number(n) * 2}d${s}`);
