// Content registry: merges the built-in SRD pack with any homebrew packs the user has enabled.
// Every lookup in the app goes through here, so homebrew content behaves exactly like SRD content.
import { CLASSES } from './srd/classes.js';
import { SPECIES } from './srd/species.js';
import { BACKGROUNDS } from './srd/backgrounds.js';
import { FEATS } from './srd/feats.js';
import { WEAPON_MASTERIES } from './srd/equipment.js';
import { SPELLS } from './srd/generated/spells.js';
import { ITEMS } from './srd/generated/equipment.js';
import { MAGIC_ITEMS } from './srd/generated/magic-items.js';
import { MONSTERS } from './srd/generated/monsters.js';
import { RULES_TEXT } from './srd/generated/rules-text.js';
import { BUILTIN_PACKS } from './packs/index.js';
export * from './srd/core.js';
export { BUILTIN_PACKS };
export { WEAPON_MASTERIES };

const PACKS_KEY = 'qw.packs.v1';

export const SRD_PACK = {
  id: 'srd-5.2', name: 'System Reference Document 5.2', builtIn: true,
  license: 'CC-BY-4.0',
  content: { classes: CLASSES, species: SPECIES, backgrounds: BACKGROUNDS, feats: FEATS, spells: SPELLS, items: [...ITEMS, ...MAGIC_ITEMS], monsters: MONSTERS },
};

// Optional built-in packs (openly licensed third-party content). Enabled ones are loaded at startup.
const BUILTIN_KEY = 'qw.builtin.v1';
export function builtinState() { try { return JSON.parse(localStorage.getItem(BUILTIN_KEY) || '{}'); } catch { return {}; } }
export const isBuiltinEnabled = (p) => builtinState()[p.id] ?? p.defaultEnabled;
export function setBuiltinEnabled(id, on) {
  const st = builtinState(); st[id] = on;
  try { localStorage.setItem(BUILTIN_KEY, JSON.stringify(st)); } catch { /* storage unavailable */ }
}
// One explicit import per pack (not a computed path) so bundlers can include them in the standalone build.
const PACK_LOADERS = {
  'black-flag-monsters': () => import('./packs/black-flag-monsters.js'),
  'black-flag': () => import('./packs/black-flag.js'),
  'kobold-bestiary': () => import('./packs/kobold-bestiary.js'),
  'kobold-spells': () => import('./packs/kobold-spells.js'),
  'level-up-a5e-alternates': () => import('./packs/level-up-a5e-alternates.js'),
  'level-up-a5e': () => import('./packs/level-up-a5e.js'),
  'open5e-originals': () => import('./packs/open5e-originals.js'),
  'spells-that-dont-suck': () => import('./packs/spells-that-dont-suck.js'),
  'taldorei': () => import('./packs/taldorei.js'),
  'tome-of-heroes': () => import('./packs/tome-of-heroes.js'),
  'vault-of-magic': () => import('./packs/vault-of-magic.js'),
};
const LOADED = (await Promise.all(BUILTIN_PACKS.filter(isBuiltinEnabled).map((p) => (PACK_LOADERS[p.id] ? PACK_LOADERS[p.id]() : Promise.reject(new Error('unknown pack')))
  .then((m) => ({ ...m.PACK, optional: true })).catch(() => null)))).filter(Boolean);
export const loadedBuiltinPacks = () => LOADED;

const KINDS = ['classes', 'species', 'backgrounds', 'feats', 'spells', 'items', 'monsters'];

// Old item ids (v0.1) → SRD dataset ids, so saved inventories keep working.
export const ITEM_ALIASES = {
  'holy-symbol': 'amulet', 'dungeoneers-pack': 'dungeoneer-pack', 'studded-leather': 'studded-leather-armor', 'arcane-focus': 'crystal',
  'travelers-clothes': 'clothes-travelers', 'gaming-set': 'dice', 'firearm-bullets': 'bullets-firearm', 'half-plate': 'half-plate-armor',
  'druidic-focus': 'sprig-of-mistletoe', 'diplomats-pack': 'diplomat-pack',
};

const TRAIT_KEYS = { Darkvision: ['Darkvision (60 ft.)', 'Darkvision (120 ft.)'], 'Damage Resistance': [] };
/** Attach the full SRD rules text to hand-modelled SRD entries (features, traits, feats). */
function attachText(kind, e) {
  const T = (k) => RULES_TEXT[k];
  if (kind === 'classes') {
    e.features = e.features.map((f) => ({ ...f, text: T(`class:${e.id}:${f.name}`) }));
    e.subclasses = (e.subclasses || []).map((s) => ({ ...s, text: T(`subclass:${s.name}`), features: s.features.map((f) => ({ ...f, text: T(`sub:${s.name}:${f.name}`) || T(`class:${e.id}:${f.name}`) })) }));
  }
  if (kind === 'species') {
    e.traits = e.traits.map((t) => {
      const keys = [t.name, ...(TRAIT_KEYS[t.name] || [])].map((n) => `trait:${e.id}:${n}`);
      if (t.name === 'Darkvision') keys.unshift(`trait:${e.id}:Darkvision (${e.darkvision || 60} ft.)`);
      return { ...t, text: keys.map(T).find(Boolean) };
    });
  }
  if (kind === 'feats') e.text = T(`feat:${e.id}`);
  if (kind === 'backgrounds') e.text = T(`background:${e.id}`);
  return e;
}
let db = null;

export function loadPacks() {
  try { return JSON.parse(localStorage.getItem(PACKS_KEY) || '[]'); } catch { return []; }
}
export function savePacks(packs) {
  try { localStorage.setItem(PACKS_KEY, JSON.stringify(packs)); } catch { /* storage unavailable */ }
  rebuild();
}

export function validatePack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object') return ['Pack must be a JSON object.'];
  if (!pack.id) errors.push('Missing "id".');
  if (!pack.name) errors.push('Missing "name".');
  if (!pack.content || typeof pack.content !== 'object') errors.push('Missing "content" object.');
  else for (const k of Object.keys(pack.content)) {
    if (![...KINDS, 'subclasses'].includes(k)) errors.push(`Unknown content type "${k}".`);
    else if (!Array.isArray(pack.content[k])) errors.push(`"content.${k}" must be an array.`);
    else pack.content[k].forEach((e, i) => { if (!e.id || !e.name) errors.push(`content.${k}[${i}] needs "id" and "name".`); });
  }
  return errors;
}

// Packs shown only until the user confirms or cancels (e.g. an import preview). Never saved.
let TRANSIENT = [];
export function setTransientPacks(packs) { TRANSIENT = packs || []; rebuild(); }

export function rebuild() {
  const packs = [SRD_PACK, ...LOADED, ...loadPacks().filter((p) => p.enabled !== false), ...TRANSIENT];
  const next = Object.fromEntries(KINDS.map((k) => [k, new Map()]));
  for (const pack of packs) {
    for (const k of KINDS) for (const e of pack.content[k] || []) {
      // Deep-copy so homebrew subclasses can be attached without mutating source data.
      const copy = { ...structuredClone(e), source: pack.builtIn ? 'SRD' : (e.sourceName || pack.name), packId: pack.id };
      next[k].set(e.id, pack.builtIn ? attachText(k, copy) : copy);
    }
  }
  for (const pack of packs) for (const sc of pack.content.subclasses || []) {
    const cls = next.classes.get(sc.classId);
    if (cls && pack.builtIn) cls.subclasses = cls.subclasses.map((x) => ({ ...x, packId: pack.id }));
    if (cls) cls.subclasses = [...(cls.subclasses || []).filter((s) => s.id !== sc.id), { ...sc, source: sc.sourceName || pack.name, packId: pack.id }];
  }
  db = next;
  return db;
}

const ensure = () => db || rebuild();
export const all = (kind) => [...ensure()[kind].values()];
export const get = (kind, id) => ensure()[kind].get(id);
export const getClass = (id) => get('classes', id);
export const getSpecies = (id) => get('species', id);
export const getBackground = (id) => get('backgrounds', id);
export const getFeat = (id) => get('feats', id);
export const getSpell = (id) => get('spells', id);
export const getItem = (id) => get('items', id) || get('items', ITEM_ALIASES[id]);
export const getMonster = (id) => get('monsters', id);
export const spellsFor = (list, maxLevel = 9) => all('spells').filter((s) => [list].flat().some((l) => s.classes.includes(l)) && s.level <= maxLevel)
  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
