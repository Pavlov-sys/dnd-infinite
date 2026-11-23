// Character storage. Characters are plain JSON (choices only); stats are derived by rules.js.
// v1 keeps everything in the browser. A sync backend can implement the same interface later.
const KEY = 'qw.characters.v1';
export const SCHEMA_VERSION = 1;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function newCharacter() {
  return {
    schema: SCHEMA_VERSION, id: uid(), name: '', level: 1, created: Date.now(), updated: Date.now(),
    classId: null, subclassId: null, backgroundId: null, speciesId: null,
    speciesChoices: {}, classChoices: {}, classSkills: [], expertise: [], languages: [],
    abilities: { method: null, base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, assigned: {}, bgBonus: {}, other: {}, override: {} },
    settings: { advancement: 'milestone', hpType: 'fixed', usePrereqs: true, disabledPacks: [], abilityDisplay: 'modifiers', encumbrance: 'standard', ignoreCoinWeight: true },
    portrait: null, xp: 0, hpRolls: {}, otherPossessions: '',
    levelFeats: {}, featChoices: {}, spells: { cantrips: [], prepared: [], spellbook: [] },
    // Proficiencies, feats and spells that don't come from a builder choice (e.g. imported characters).
    extras: { skills: [], tools: [], armor: [], weapons: [], feats: [], spells: [], resist: [], defenses: [], saveNotes: [], resources: [], features: [], actions: [], actionKinds: {} },
    equipment: { mode: 'equipment', classOption: null, bgOption: null, applied: false },
    inventory: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    hp: { current: null, temp: 0 }, hpBonus: 0, acBonus: 0, deathSaves: { success: 0, fail: 0 },
    custom: { prof: {}, bonus: {}, override: {}, adv: [] },
    used: { slots: {}, resources: {}, pact: 0 }, conditions: [], exhaustion: 0, heroicInspiration: false,
    details: {
      alignment: '', faith: '', lifestyle: '', player: '',
      hair: '', skin: '', eyes: '', height: '', weight: '', age: '', gender: '', appearance: '',
      personality: '', ideals: '', bonds: '', flaws: '',
      organizations: '', allies: '', enemies: '', backstory: '', notes: '',
    },
  };
}

/** Fill in fields added in newer versions so older saved characters keep working. */
// Older imports kept a wizard's unprepared spells as "Spellbook" extras; move them into the spellbook.
function migrateSpellbook(c) {
  const sb = (c.extras?.spells || []).filter((x) => x.source === 'Spellbook');
  if (!sb.length) return {};
  return {
    spells: { cantrips: [], prepared: [], ...c.spells, spellbook: [...new Set([...(c.spells?.spellbook || []), ...(c.spells?.prepared || []), ...sb.map((x) => x.spellId)])] },
    extras: { ...c.extras, spells: c.extras.spells.filter((x) => x.source !== 'Spellbook') },
  };
}

export function normalize(c) {
  const base = newCharacter();
  const out = {
    ...base, ...c,
    settings: { ...base.settings, ...c.settings }, details: { ...base.details, ...c.details },
    abilities: { ...base.abilities, ...c.abilities }, equipment: { ...base.equipment, ...c.equipment },
    custom: { ...base.custom, ...c.custom },
    used: { ...base.used, ...c.used }, currency: { ...base.currency, ...c.currency },
    extras: { ...base.extras, ...c.extras }, spells: { ...base.spells, ...c.spells },
    ...migrateSpellbook(c),
  };
  if (out.abilities.method === 'roll') out.abilities.method = 'manual';
  out.abilities.other ||= {}; out.abilities.override ||= {};
  return out;
}

let cache = null;
function read() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '[]').map(normalize); } catch { cache = []; }
  return cache;
}
function write() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable: keep in memory */ }
}

export const listCharacters = () => [...read()].sort((a, b) => b.updated - a.updated);
export const getCharacter = (id) => read().find((c) => c.id === id) || null;
export function saveCharacter(c) {
  c.updated = Date.now();
  const list = read();
  const i = list.findIndex((x) => x.id === c.id);
  if (i >= 0) list[i] = c; else list.push(c);
  write();
  return c;
}
export function deleteCharacter(id) { cache = read().filter((c) => c.id !== id); write(); }
export function duplicateCharacter(id) {
  const src = getCharacter(id); if (!src) return null;
  const copy = { ...structuredClone(src), id: uid(), name: `${src.name || 'Unnamed'} (copy)`, created: Date.now() };
  return saveCharacter(copy);
}

export function exportCharacter(c) {
  return JSON.stringify({ format: 'dnd-infinite-character', ...c }, null, 2);
}
export function importCharacter(text) {
  const data = JSON.parse(text);
  if (!['dnd-infinite-character', 'questwright-character'].includes(data.format) && !data.abilities) throw new Error('This does not look like a character file.');
  delete data.format;
  const c = normalize({ ...data, id: uid(), updated: Date.now() });
  return saveCharacter(c);
}
