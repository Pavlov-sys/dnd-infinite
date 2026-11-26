// D&D Beyond character importer. Reads the fillable PDF that D&D Beyond exports ("Export to PDF")
// and rebuilds the character as Infinity Codex choices, matched against the content you have enabled.
// Anything that can't be matched is listed in the report and saved in the character's notes,
// so the sheet still shows the same numbers as the original.
import { all, getClass, getFeat, getBackground, getSpecies, getSpell, getItem, SKILLS, ABILITIES, FULL_CASTER_SLOTS, setTransientPacks, loadPacks, savePacks } from '../data/index.js';
import { slug } from './importers.js';
import { newCharacter, normalize } from './store.js';
import { compute, featSlots, fmt } from './rules.js';
import { readPdfFields } from './pdf-fields.js';

export const norm = (s) => String(s || '').toLowerCase().replace(/['’`]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
const ABIL_NAMES = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const ABIL_FIELDS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
// Field-name stems D&D Beyond uses for skills (several spellings exist across sheet versions).
const SKILL_FIELDS = {
  acrobatics: ['acrobatics'], 'animal-handling': ['animal', 'animalhandling'], arcana: ['arcana'], athletics: ['athletics'], deception: ['deception'],
  history: ['history'], insight: ['insight'], intimidation: ['intimidation'], investigation: ['investigation'], medicine: ['medicine'], nature: ['nature'],
  perception: ['perception'], performance: ['performance'], persuasion: ['persuasion'], religion: ['religion'], 'sleight-of-hand': ['sleightofhand'],
  stealth: ['stealth'], survival: ['survival'],
};
// Book codes that mean "this is the 2024 core / SRD version" — name matches to SRD content are exact.
const CORE_BOOKS = /^(PHB-2024|PHB|BR|SRD|BASIC|FREE-RULES|DMG-2024|MM-2025)\b/i;

/** True for files that look like a D&D Beyond character sheet PDF. */
export const looksLikeDdb = (fields) => ['CharacterName', 'CLASS  LEVEL', 'ProficienciesLang', 'Wpn Name'].filter((k) => k in fields).length >= 2;

// ------------------------------------------------------------------ name matching
const indexCache = new Map();
function index(kind) {
  if (indexCache.has(kind)) return indexCache.get(kind);
  const m = new Map();
  const core = (e) => e.packId === 'srd-5.2' || e.source === 'SRD';
  // Core entries first so they win name clashes with optional packs.
  const imported = (e) => !core(e) && e.imported === 'ddb';
  for (const e of [...all(kind).filter(core), ...all(kind).filter(imported), ...all(kind).filter((e) => !core(e) && !imported(e))]) {
    for (const key of [norm(e.name), norm(e.name.replace(/\s*\([^)]*\)\s*$/, ''))]) if (key && !m.has(key)) m.set(key, e);
  }
  indexCache.set(kind, m);
  return m;
}
/** Candidate spellings: as-is, without "Melf's", "Clothes, Fine" → "Fine Clothes", without "(…)", singular. */
function variants(name) {
  const s = String(name || '').trim(); const out = [s];
  out.push(s.replace(/^[A-Z][a-z]+['’]s\s+/, ''));
  if (/,/.test(s)) { const [a, ...b] = s.split(/\s*,\s*/); out.push(`${b.join(' ')} ${a}`); }
  out.push(s.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  out.push(s.replace(/s$/, ''));
  out.push(s.replace(/\s*[+]\d\s*$/, '').replace(/^\+\d\s+/, ''));
  out.push(`${s} Armor`);
  out.push(s.split(/\s*[,(]/)[0]);
  return [...new Set(out.map(norm).filter(Boolean))];
}
export function findByName(kind, name) {
  const m = index(kind);
  for (const v of variants(name)) if (m.has(v)) return m.get(v);
  return null;
}
const isCore = (e) => e && (e.packId === 'srd-5.2' || e.source === 'SRD');
export function resetImportCache() { indexCache.clear(); }

// ------------------------------------------------------------------ sheet text parsing
/** Normalise field names: D&D Beyond sheets have stray spaces ("Stealth ", "Wpn2 AtkBonus "). */
function fieldMap(fields) {
  const F = {};
  for (const [k, v] of Object.entries(fields)) { const key = k.replace(/\s+/g, ' ').trim(); if (!(key in F) || (v && !F[key])) F[key] = String(v ?? '').trim(); }
  const loose = {};
  for (const [k, v] of Object.entries(F)) { const key = k.toLowerCase().replace(/[^a-z0-9]/g, ''); if (!(key in loose) || (v && !loose[key])) loose[key] = v; }
  return { F, get: (k) => F[k] ?? '', loose: (k) => loose[k.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? '' };
}
const numbered = (F, re) => Object.keys(F).map((k) => { const m = k.match(re); return m ? [Number(m[1]), k] : null; }).filter(Boolean).sort((a, b) => a[0] - b[0]);
const toInt = (s) => { const m = String(s || '').match(/[+-]?\d+/); return m ? Number(m[0]) : null; };

/** Join text that D&D Beyond split across several boxes/pages; a box that starts mid-sentence continues the previous line. */
export function joinBoxes(chunks) {
  return chunks.filter((t) => t != null && t !== '').reduce((acc, t) => {
    if (!acc) return t;
    return !/\n\s*$/.test(acc) && /^\s*[a-z(,;.]/.test(t) ? `${acc.replace(/\s+$/, '')} ${t.replace(/^\s+/, '')}` : `${acc}\n${t}`;
  }, '');
}

/** The sheet's Actions box: "=== BONUS ACTIONS ===", then "Name" lines followed by indented descriptions. */
export function actionEntries(text) {
  const KIND = { ACTIONS: 'action', 'BONUS ACTIONS': 'bonus', REACTIONS: 'reaction', SPECIAL: 'other', OTHER: 'other' };
  const lines = String(text || '').split('\n'); const out = []; let kind = null; let cur = null;
  const nextText = (i) => { for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j]; return ''; };
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    const head = line.match(/^\s*===\s*(.+?)\s*===\s*$/);
    if (head) { kind = KIND[head[1].toUpperCase()] || 'other'; cur = null; return; }
    if (!kind || !line.trim()) { if (cur) cur.desc += '\n'; return; }
    if (!/^\s/.test(line) && /^\s{3,}\S/.test(nextText(i))) { cur = { kind, name: line.trim(), desc: '' }; out.push(cur); return; }
    if (cur) cur.desc += `${line.trim()}\n`;
  });
  for (const e of out) e.desc = e.desc.replace(/\n{3,}/g, '\n\n').trim();
  return out.filter((e) => !/^standard actions$/i.test(e.name));
}

/** "=== HEADER ===" sections in a text block → { HEADER: text }. */
export function sections(text) {
  const out = {}; let cur = '_';
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^\s*===\s*(.+?)\s*===\s*$/);
    if (m) { cur = m[1].toUpperCase(); out[cur] = out[cur] || ''; continue; }
    out[cur] = (out[cur] || '') + line + '\n';
  }
  return out;
}

/** Features & Traits text → [{ section, name, ref, body, picks }]. "| X" lines are the choices made. */
export function featureEntries(text) {
  const out = []; let section = ''; let cur = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const head = line.match(/^\s*===\s*(.+?)\s*===\s*$/);
    if (head) { section = head[1].toUpperCase(); cur = null; continue; }
    const item = line.match(/^\s*\*\s+(.+)$/);
    if (item) {
      const [name, ...ref] = item[1].split(/\s+•\s+/);
      cur = { section, name: name.trim(), ref: ref.join(' • ').trim(), body: '', picks: [], options: [] }; out.push(cur); continue;
    }
    if (!cur) continue;
    const pick = line.match(/^(\s*)\|\s*(.+)$/);
    if (pick) {
      const parts = pick[2].split(/\s+•\s*/).map((x) => x.trim()).filter(Boolean);
      cur.picks.push(...parts);
      const opt = cur.options[cur.options.length - 1];
      // A deeper "|" line belongs to the option above it (e.g. "Pact of the Blade: Conjure: 1 Bonus Action").
      if (opt && pick[1].length > 4) opt.picks.push(...parts);
      else cur.options.push({ name: parts[0], ref: parts.slice(1).join(' • '), body: '', picks: [] });
    } else if (cur.options.length) cur.options[cur.options.length - 1].body += `${line.trim()}\n`;
    else cur.body += `${line.trim()}\n`;
  }
  for (const e of out) { e.body = e.body.trim(); for (const o of e.options) o.body = o.body.trim(); }
  return out;
}

/** "Fighter 5 / Wizard 2" or "Wizard (Evoker) 6" → [{ name, sub, level }]. */
export function parseClasses(s) {
  return String(s || '').split(/\s*\/\s*/).map((part) => {
    const m = part.match(/^(.+?)(?:\s*\(([^)]+)\))?\s+(\d+)\s*$/);
    return m ? { name: m[1].trim(), sub: m[2]?.trim() || null, level: Number(m[3]) } : null;
  }).filter(Boolean);
}

const proficiencyLists = (text) => {
  const sec = sections(text); const list = (k) => (sec[k] || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return { armor: list('ARMOR'), weapons: list('WEAPONS'), tools: list('TOOLS'), languages: list('LANGUAGES'), other: list('_') };
};

// ------------------------------------------------------------------ main conversion
/**
 * Convert D&D Beyond PDF fields into an Infinity Codex character.
 * Returns { character, report } where report = { name, summary, matched, approx, missing, diffs, warnings }.
 */
function convert(rawFields, { now = new Date(), collect = false } = {}) {
  resetImportCache();
  const make = { cls: null, sub: null, species: null, bg: null, feats: [], spells: [] };
  const { F, get, loose } = fieldMap(rawFields);
  const c = newCharacter();
  const report = { name: '', summary: '', matched: [], approx: [], missing: [], diffs: [], warnings: [], notes: [], reused: [] };
  const matched = (kind, from, e) => { if (e.imported === IMPORT_TAG) { if (e.packId !== 'ddb-pending') report.reused.push({ kind, name: e.name }); return; } (isCore(e) || norm(from) === norm(e.name) ? report.matched : report.approx).push({ kind, from, to: e.name, source: e.source || 'SRD' }); };
  const approx = (kind, from, e, why) => report.approx.push({ kind, from, to: e.name, source: e.source || 'SRD', why });
  const missing = (kind, name, detail = '') => report.missing.push({ kind, name, detail });

  // Identity
  c.name = get('CharacterName') || get('CharacterName2') || 'Imported Character';
  report.name = c.name;
  c.details.player = get('PLAYER NAME');
  const xp = get('EXPERIENCE POINTS');
  if (/milestone/i.test(xp) || !toInt(xp)) c.settings.advancement = 'milestone';
  else { c.settings.advancement = 'xp'; c.xp = toInt(xp.replace(/,/g, '')); }
  const det = c.details;
  Object.assign(det, {
    gender: get('GENDER'), age: get('AGE'), height: get('HEIGHT'), weight: get('WEIGHT'), alignment: get('ALIGNMENT'), faith: get('FAITH'),
    skin: get('SKIN'), eyes: get('EYES'), hair: get('HAIR'),
    personality: get('PersonalityTraits'), ideals: get('Ideals'), bonds: get('Bonds'), flaws: get('Flaws'),
    appearance: get('Appearance'), organizations: get('AlliesOrganizations'), backstory: get('Backstory'),
  });
  const ddbNotes = [get('AdditionalNotes1'), get('AdditionalNotes2')].filter(Boolean).join('\n\n');

  // Feature text (spread across several boxes and pages)
  const featText = joinBoxes(numbered(F, /^FeaturesTraits(\d+)$/).map(([, k]) => F[k]));
  const entries = featureEntries(featText);
  const featureNames = new Set(entries.map((e) => norm(e.name)));

  // Class & level
  const classes = parseClasses(get('CLASS LEVEL') || get('CLASS  LEVEL'));
  const totalLevel = Math.max(1, Math.min(20, classes.reduce((s, x) => s + x.level, 0) || 1));
  c.level = totalLevel;
  const main = [...classes].sort((a, b) => b.level - a.level)[0];
  const cls = main ? findByName('classes', main.name) : null;
  if (classes.length > 1) report.warnings.push(`Multiclassing isn't supported yet, so this is imported as a level ${totalLevel} ${cls?.name || main?.name}. Levels in ${classes.filter((x) => x !== main).map((x) => `${x.name} ${x.level}`).join(', ')} are listed in the notes.`);
  if (cls) { c.classId = cls.id; matched('Class', main.name, cls); } else if (main) { missing('Class', main.name, 'Not in your enabled content.'); make.cls = main.name; }

  let subEntry = null;
  // Subclass: the "<Class> Subclass" feature's pick, the class-level parenthesis, or the best feature-name overlap.
  if (cls) {
    subEntry = entries.find((e) => /subclass$|^(arcane tradition|divine domain|sacred oath|primal path|druid circle|bard college|monastic tradition|roguish archetype|martial archetype|sorcerous origin|otherworldly patron|ranger archetype)$/i.test(e.name) && e.picks.length);
    const subName = main.sub || subEntry?.picks[0];
    const subs = cls.subclasses || [];
    let sub = subName ? subs.find((s) => norm(s.name) === norm(subName)) : null;
    if (!sub && subName) sub = subs.find((s) => norm(s.name).includes(norm(subName)) || norm(subName).includes(norm(s.name)));
    if (!sub) {
      const scored = subs.map((s) => [s, (s.features || []).filter((f) => featureNames.has(norm(f.name))).length]).sort((a, b) => b[1] - a[1]);
      if (scored[0]?.[1] >= 2) sub = scored[0][0];
    }
    if (sub) { c.subclassId = sub.id; matched('Subclass', subName || sub.name, sub); }
    else if (subName) { missing('Subclass', subName, `Not in your enabled content for ${cls.name}.`); make.sub = subName; }
  }

  if (!cls && main) {
    subEntry = entries.find((e) => /subclass$/i.test(e.name) && e.picks.length);
    if (main.sub || subEntry) make.sub = main.sub || subEntry.picks[0];
  }

  // Species (and lineage / ancestry picks)
  const raceName = get('RACE') || get('RACE2');
  let species = findByName('species', raceName);
  let lineageHint = null;
  if (!species && raceName.includes(' ')) { species = findByName('species', raceName.split(' ').pop()); lineageHint = raceName; }
  if (species) {
    c.speciesId = species.id; matched('Species', raceName, species);
    const picks = entries.filter((e) => /SPECIES|RACIAL/.test(e.section)).flatMap((e) => e.picks);
    for (const ch of species.choices || []) {
      if (!Array.isArray(ch.options)) continue;
      const hit = ch.options.find((o) => [lineageHint, ...picks].some((p) => p && (norm(p) === norm(o.name) || norm(p).includes(norm(o.name)) || norm(o.name).includes(norm(p)))));
      if (hit) c.speciesChoices[ch.id] = hit.id; else report.warnings.push(`Choose your ${ch.name} in the builder (Species step).`);
    }
  } else if (raceName) { missing('Species', raceName, 'Not in your enabled content.'); make.species = raceName; }

  // Ability scores: the sheet shows final scores. Store them as base scores; bonuses we can identify are subtracted below.
  c.abilities.method = 'manual';
  for (const a of ABILITIES) c.abilities.base[a.id] = toInt(get(ABIL_FIELDS[a.id])) || 10;
  c.abilities.bgBonus = { mode: 'imported' };

  // Skills from the sheet: P = proficient, E = expertise
  const profMark = (id) => SKILL_FIELDS[id].map((s) => loose(`${s}prof`)).find(Boolean) || '';
  const sheetSkill = (id) => toInt(SKILL_FIELDS[id].map((s) => loose(s)).find(Boolean));
  const profs = new Set(); const expert = new Set();
  for (const s of SKILLS) { const m = profMark(s.id).toUpperCase(); if (m === 'E') { profs.add(s.id); expert.add(s.id); } else if (m === 'P' || m === '•') profs.add(s.id); }
  const unassigned = new Set(profs);

  // Background (accepted only if every skill it gives is on the sheet; otherwise it's a different background)
  const bgName = get('BACKGROUND') || get('BACKGROUND2');
  let bg = findByName('backgrounds', bgName);
  if (bg && !(bg.skills || []).every((s) => profs.has(s))) {
    missing('Background', bgName, `Your content has ${bg.name} from ${bg.source}, but it gives different skills, so it wasn't used.`);
    make.bg = bgName;
    bg = null;
  } else if (bg) { c.backgroundId = bg.id; matched('Background', bgName, bg); (bg.skills || []).forEach((s) => unassigned.delete(s)); }
  else if (bgName) { missing('Background', bgName, 'Not in your enabled content.'); make.bg = bgName; }

  // Feats
  const featEntries = entries.filter((e) => e.section === 'FEATS');
  const feats = [];
  for (const e of featEntries) {
    if (/\S\s+Ability Score Improvements$/i.test(e.name)) continue; // "Soldier Ability Score Improvements" = the background's +2/+1
    const param = e.name.match(/\(([^)]+)\)\s*$/)?.[1] || null;
    const f = findByName('feats', e.name);
    if (!f) { missing('Feat', e.name, e.ref); make.feats.push(e); continue; }
    if (f.id === 'ability-score-improvement') { feats.push({ f, e, param, asi: true }); continue; }
    matched('Feat', e.name, f); feats.push({ f, e, param });
  }
  const takeFeat = (pred) => { const i = feats.findIndex((x) => !x.used && pred(x.f)); if (i < 0) return null; feats[i].used = true; return feats[i]; };
  const featChoicesFor = (x) => {
    const ch = {};
    for (const def of x.f.choices || []) {
      if (def.type === 'spell-list' && x.param) { const l = norm(x.param); if ((def.options || []).includes(l)) ch[def.id] = l; }
      if (def.type === 'ability' || def.type === 'ability-plus1') {
        const ab = x.e.picks.map((p) => ABIL_NAMES[norm(p).split(' ')[0]]).find(Boolean);
        if (ab && (def.options === 'any' || !def.options || def.options.includes(ab))) {
          ch[def.id] = ab;
          if (def.type === 'ability-plus1') c.abilities.base[ab] -= 1; // the sheet's score already includes this +1
        }
      }
    }
    return ch;
  };
  const place = (key, x) => { c.featChoices[key] = featChoicesFor(x); x.key = key; return x.f.id; };
  if (bg?.feat?.id) { const x = takeFeat((f) => f.id === bg.feat.id); if (x) place('background', x); }
  else if (bg?.feat?.choose) { const x = takeFeat((f) => f.category === 'origin'); if (x) c.bgFeatId = place('background', x); }
  if (species?.choices?.some((ch) => ch.type === 'origin-feat')) { const x = takeFeat((f) => f.category === 'origin'); if (x) c.speciesChoices.versatile = place('versatile', x); else report.warnings.push('Choose the Origin feat from Versatile in the builder (Species step).'); }
  for (const ch of cls?.choices || []) {
    if (ch.type !== 'feat' || totalLevel < ch.level) continue;
    const fromFeature = entries.find((e) => norm(e.name) === norm(ch.name))?.picks.map((p) => findByName('feats', p)).find(Boolean);
    const x = fromFeature ? { f: fromFeature, e: { picks: [] } } : takeFeat((f) => f.category === (ch.category || 'fighting-style'));
    if (x) c.classChoices[ch.id] = place(ch.id, x);
  }
  for (const slot of featSlots(cls, totalLevel)) {
    const x = takeFeat((f) => (slot.kind === 'epic-boon' ? f.category === 'epic-boon' : f.category !== 'origin' && f.category !== 'fighting-style' && f.category !== 'epic-boon'));
    if (x && !x.asi) c.levelFeats[slot.key] = place(slot.key, x);
    else { if (x) x.used = true; c.levelFeats[slot.key] = 'ability-score-improvement'; c.featChoices[slot.key] = { asi: { mode: 'imported' } }; }
  }
  for (const x of feats.filter((y) => !y.used && !y.asi)) { const key = `extra-${c.extras.feats.length}`; c.extras.feats.push({ featId: x.f.id, source: 'Imported from D&D Beyond' }); place(key, x); }

  // Class options (Divine Order, Primal Order…) from the "| pick" lines under that feature.
  const allPicks = entries.flatMap((e) => e.picks);
  for (const ch of cls?.choices || []) {
    if (ch.type !== 'option' || totalLevel < ch.level) continue;
    const own = entries.find((e) => norm(e.name) === norm(ch.name))?.picks || [];
    const opt = ch.options.find((o) => own.some((p) => norm(p) === norm(o.name))) || ch.options.find((o) => allPicks.some((p) => norm(p) === norm(o.name)));
    if (opt) c.classChoices[ch.id] = opt.id; else report.warnings.push(`Choose your ${ch.name} in the builder (Class step).`);
  }

  const featIdForKey = (key) => (key === 'background' ? (bg?.feat?.id || c.bgFeatId) : key === 'versatile' ? c.speciesChoices.versatile
    : key.startsWith('extra-') ? c.extras.feats[Number(key.slice(6))]?.featId : c.levelFeats[key] || c.classChoices[key]);

  // Skills: class picks, species and feat skill picks, then anything left over.
  if (cls) {
    const from = cls.skillChoices.from === 'any' ? SKILLS.map((s) => s.id) : cls.skillChoices.from;
    for (const s of from) if (unassigned.has(s) && c.classSkills.length < cls.skillChoices.count) { c.classSkills.push(s); unassigned.delete(s); }
  }
  for (const ch of species?.choices || []) {
    if (ch.type !== 'skill') continue;
    const opts = ch.options === 'any' ? SKILLS.map((s) => s.id) : ch.options.map((o) => o.id || o);
    const s = [...unassigned].find((x) => opts.includes(x));
    if (s) { c.speciesChoices[ch.id] = s; unassigned.delete(s); }
  }
  for (const key of Object.keys(c.featChoices)) {
    const def = getFeat(featIdForKey(key))?.choices?.find((d) => d.type === 'skill');
    if (def) { const picked = [...unassigned].slice(0, def.count || 1); picked.forEach((s) => unassigned.delete(s)); c.featChoices[key].skills = picked; }
  }
  c.extras.skills = [...unassigned];
  c.expertise = [...expert];

  // Proficiencies & languages
  const pl = proficiencyLists(get('ProficienciesLang'));
  const auto = new Set(['common', 'thieves cant', 'druidic']);
  c.languages = pl.languages.filter((l) => !auto.has(norm(l)));
  const known = new Set([...(cls?.tools || []), ...(bg?.tool ? [bg.tool] : [])].map(norm));
  c.extras.tools = pl.tools.filter((t) => !known.has(norm(t)));
  const GENERIC = [[/gaming set/i, /card|dice|chess|ante|gaming|set/i], [/musical instrument/i, /bagpipe|drum|dulcimer|flute|horn|lute|lyre|pipe|shawm|viol|instrument/i], [/artisan/i, /tools|supplies|utensils|kit/i]];
  const g = bg?.tool && GENERIC.find(([gen]) => gen.test(bg.tool));
  if (g && c.extras.tools.some((t) => g[1].test(t))) c.extras.replaceBgTool = true;
  const ARM = { 'light armor': 'light', 'medium armor': 'medium', 'heavy armor': 'heavy', shields: 'shield', shield: 'shield' };
  const WPN = { 'simple weapons': 'simple', 'martial weapons': 'martial' };
  c.extras.armor = pl.armor.map((a) => ARM[norm(a)]).filter((a) => a && !(cls?.armor || []).includes(a));
  c.extras.weapons = pl.weapons.map((w) => WPN[norm(w)]).filter((w) => w && !(cls?.weapons || []).includes(w));
  const otherWeapons = [];
  for (const w of pl.weapons.filter((x) => !WPN[norm(x)])) {
    const it = findByName('items', w);
    if (it?.type === 'weapon') { if (!(cls?.weapons || []).includes(it.id)) c.extras.weapons.push(it.id); } else otherWeapons.push(w);
  }

  // D&D Beyond's own action types (Actions box): which features are Bonus Actions, Reactions or Special,
  // plus action entries that aren't features themselves (e.g. "Pact of the Blade: Bond").
  const acts = actionEntries(joinBoxes(numbered(F, /^Actions(\d+)$/).map(([, k]) => F[k])));
  const featureNorms = new Set(entries.flatMap((e) => [e.name, ...e.options.map((o) => o.name)]).map(norm));
  c.extras.actionKinds = {}; c.extras.actions = [];
  for (const a of acts) {
    a.name = a.name.split(/\s+•\s+/)[0].trim();
    const bare = a.name.replace(/\s*\([^)]*\)\s*$/, '');
    if (featureNorms.has(norm(a.name)) || featureNorms.has(norm(bare))) { c.extras.actionKinds[norm(featureNorms.has(norm(a.name)) ? a.name : bare)] = a.kind; continue; }
    const parent = a.name.split(':')[0];
    if (a.name.includes(':') && featureNorms.has(norm(parent))) c.extras.actionKinds[norm(parent)] = 'none'; // shown through its sub-actions instead
    c.extras.actions.push({ name: a.name, kind: a.kind, desc: a.desc });
  }

  // Defenses ("Resistances - Cold \nImmunities - Magical Sleep") and save notes ("Advantage against disease")
  const DAMAGE = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
  for (const line of get('Defenses').split(/\n/)) {
    const m = line.match(/^\s*(Resistances?|Immunit(?:y|ies)|Vulnerabilit(?:y|ies))\s*[-–:]\s*(.+)$/i); if (!m) continue;
    const items = m[2].split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
    if (/^resist/i.test(m[1])) for (const x of items) { if (DAMAGE.includes(x.toLowerCase())) { if (!(species?.resist || []).includes(x.toLowerCase())) c.extras.resist.push(x.toLowerCase()); } else c.extras.defenses.push(`Resistance: ${x}`); }
    else c.extras.defenses.push(...items.map((x) => `${/^immun/i.test(m[1]) ? 'Immunity' : 'Vulnerability'}: ${x}`));
  }
  c.extras.saveNotes = get('SaveModifiers').split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  if (entries.some((e) => /advantage on death saving throws/i.test(e.body)) && !c.extras.saveNotes.some((n) => /death/i.test(n))) c.extras.saveNotes.push('Advantage on Death Saves');

  // Limited uses shown on the sheet ("| 2 / Long Rest") that the content doesn't already track
  const tracked = new Set([...(cls?.resources || []), ...((cls?.subclasses || []).find((x) => x.id === c.subclassId)?.resources || [])].map((r) => norm(r.name)));
  for (const e of entries) for (const p of e.picks) {
    const m = p.match(/^(\d+)\s*\/\s*(Short|Long)\s+Rest/i);
    if (m && !tracked.has(norm(e.name))) { tracked.add(norm(e.name)); c.extras.resources.push({ id: `ddb-${slug(e.name)}`, name: e.name, reset: m[2].toLowerCase(), uses: Number(m[1]) }); }
  }

  // Options chosen inside class features (Eldritch Invocations, etc.) that carry their own rules text
  for (const e of entries.filter((x) => /FEATURES$/.test(x.section))) {
    for (const o of e.options) {
      if (!o.body || /^\d+\s*\//.test(o.name)) continue;
      c.extras.features.push({ name: o.name, desc: [o.body, o.picks.length ? `**Uses:** ${o.picks.join(' · ')}` : ''].filter(Boolean).join('\n\n'), source: cls?.name || main?.name || e.name, parent: e.name });
    }
  }

  // Spells
  const spellRows = numbered(F, /^spellName(\d+)$/).map(([i, k]) => ({ i,
    name: F[k], source: get(`spellSource${i}`), saveHit: get(`spellSaveHit${i}`), time: get(`spellCastingTime${i}`), range: get(`spellRange${i}`),
    comp: get(`spellComponents${i}`), duration: get(`spellDuration${i}`), page: get(`spellPage${i}`), prepared: get(`spellPrepared${i}`), notes: get(`spellNotes${i}`),
  })).filter((r) => r.name);
  const classNames = new Set(classes.map((x) => norm(x.name)));
  const subFeatureNames = new Set((cls?.subclasses?.find((s) => s.id === c.subclassId)?.features || []).map((f) => norm(f.name)));
  const classFeatureNames = new Set((cls?.features || []).map((f) => norm(f.name)));
  const spellMissing = [];
  const pre = compute(normalize(structuredClone(c)));
  const sc = pre.spellcasting;
  const grantedIds = new Set(pre.grantedSpells.map((g) => g.spellId));
  // The sheet lists spells by level, so neighbouring rows tell us each row's level.
  // A name match at a different level is a different spell (e.g. a third-party spell with the same name).
  const headerLevel = {}; let curLevel = null;
  for (const k of Object.keys(rawFields)) {
    const key = k.replace(/\s+/g, ' ').trim();
    const hm = key.match(/^spellHeader\d+$/) && String(rawFields[k]).match(/CANTRIP|(\d+)(st|nd|rd|th)\s+LEVEL/i);
    if (hm) curLevel = hm[1] ? Number(hm[1]) : 0;
    const nm = key.match(/^spellName(\d+)$/); if (nm && curLevel !== null) headerLevel[Number(nm[1])] = curLevel;
  }
  const found = spellRows.map((r) => findByName('spells', r.name));
  // Trust the headers only if every core spell we recognise sits under its own level's header.
  const headersAgree = spellRows.every((r, i) => headerLevel[r.i] === undefined || !found[i] || !isCore(found[i]) || found[i].level === headerLevel[r.i]);
  spellRows.forEach((r) => { r.level = headersAgree ? headerLevel[r.i] : undefined; });
  const fits = (i) => {
    const lv = found[i]?.level; if (lv === undefined) return false;
    if (spellRows[i].level !== undefined) return lv === spellRows[i].level;
    const before = found.slice(0, i).filter((x, j) => x && isCore(x) && j !== i).map((x) => x.level);
    const after = found.slice(i + 1).filter((x) => x && isCore(x)).map((x) => x.level);
    return (!before.length || lv >= Math.max(...before)) && (!after.length || lv <= Math.min(...after));
  };
  // Level of a row we couldn't match: the nearest matched core spell before it (or after it).
  const rowLevel = (i) => {
    if (spellRows[i].level !== undefined) return spellRows[i].level;
    for (let j = i - 1; j >= 0; j--) if (found[j] && isCore(found[j])) return found[j].level;
    for (let j = i + 1; j < found.length; j++) if (found[j] && isCore(found[j])) return found[j].level;
    return 0;
  };
  let overflow = 0;
  for (const [i, r] of spellRows.entries()) {
    const sp = found[i] && ((isCore(found[i]) && (r.level === undefined || found[i].level === r.level)) || fits(i)) ? found[i] : null;
    if (found[i] && !sp) report.notes.push(`${r.name}: your content has a ${found[i].source} spell with this name, but it's a different level, so it wasn't used.`);
    if (!sp) { spellMissing.push(r); missing('Spell', r.name, [r.source, r.page].filter(Boolean).join(' · ')); make.spells.push({ ...r, level: rowLevel(i) }); continue; }
    if (!isCore(sp) && sp.imported !== IMPORT_TAG && !CORE_BOOKS.test(r.page)) approx('Spell', r.name, sp, `Matched by name to the ${sp.source} version, which may differ from ${r.page || 'the original'}.`);
    else matched('Spell', r.name, sp);
    const featKey = Object.keys(c.featChoices).find((key) => {
      const f = getFeat(featIdForKey(key));
      return f && f.choices?.some((x) => x.type === 'cantrip' || x.type === 'spell') && norm(r.source).startsWith(norm(f.name));
    });
    if (featKey) {
      const def = getFeat(featIdForKey(featKey)).choices.find((x) => (sp.level === 0 ? x.type === 'cantrip' : x.type === 'spell'));
      if (def) { const ch = c.featChoices[featKey]; ch[def.id] = [...(ch[def.id] || []), sp.id]; continue; }
    }
    if (grantedIds.has(sp.id)) continue;
    const isClassSpell = classNames.has(norm(r.source)) || subFeatureNames.has(norm(r.source)) || classFeatureNames.has(norm(r.source)) || /spellbook/i.test(r.source);
    if (isClassSpell && sc) {
      if (sp.level === 0 && c.spells.cantrips.length < sc.cantripsMax) { c.spells.cantrips.push(sp.id); continue; }
      if (sp.level > 0 && classNames.has(norm(r.source)) && cls?.id === 'wizard') {
        // The PDF lists the whole spellbook and doesn't mark which spells are prepared.
        c.spells.spellbook.push(sp.id);
        if (c.spells.prepared.length < sc.preparedMax) c.spells.prepared.push(sp.id); else overflow++;
        continue;
      }
      if (sp.level > 0 && classNames.has(norm(r.source)) && c.spells.prepared.length < sc.preparedMax) { c.spells.prepared.push(sp.id); continue; }
    }
    if (sc && isClassSpell && sp.level > 0 && classNames.has(norm(r.source))) overflow++;
    c.extras.spells.push({ spellId: sp.id, source: isClassSpell ? r.source : r.source || 'Imported' });
  }

  if (overflow && cls?.id === 'wizard') report.warnings.push(`The PDF lists all ${c.spells.spellbook.length} spells in the spellbook but doesn't say which are prepared, so the first ${sc?.preparedMax} were prepared. Check them against D&D Beyond and use Prepare / Unprepare in the Spells tab.`);
  else if (overflow) report.notes.push(`${overflow} ${cls?.name} spell${overflow > 1 ? 's' : ''} beyond your ${sc?.preparedMax}-spell prepared limit ${overflow > 1 ? 'were' : 'was'} listed as other spell${overflow > 1 ? 's' : ''}. Swap which ones are prepared in the builder.`);
  // Free once-per-Long-Rest casts already used ("1/LR (Used)")
  for (const r of spellRows) if (/\(used\)/i.test(r.notes || '')) { const sp = findByName('spells', r.name); if (sp) c.used.resources[`free-${sp.id}`] = 1; }

  // Equipment
  const weaponNames = new Set(numbered(F, /^Wpn Name(?: (\d+))?$/).map(([, k]) => norm(F[k])).concat(norm(get('Wpn Name'))));
  const invMissing = [];
  const addItem = (name, qty, weight, attuned) => {
    if (!name) return;
    const it = findByName('items', name);
    const n = Math.max(1, toInt(qty) || 1);
    if (it) {
      matched('Item', name, it);
      const lb = parseFloat(String(weight).replace(/[^\d.]/g, ''));
      const entry = { itemId: it.id, qty: n, equipped: attuned || (it.type === 'weapon' && weaponNames.has(norm(it.name))) || weaponNames.has(norm(name)) };
      if (Number.isFinite(lb) && it.weight !== undefined && Math.abs(lb / n - it.weight) > 0.01) entry.weight = +(lb / n).toFixed(3);
      if (norm(name) !== norm(it.name)) entry.label = name; // e.g. "Rope, Hempen (50 feet)"
      c.inventory.push(entry);
    } else {
      const lb = parseFloat(String(weight).replace(/[^\d.]/g, '')) || 0;
      invMissing.push(name);
      c.inventory.push({ itemId: null, qty: n, equipped: !!attuned, custom: { name, type: 'gear', weight: n ? +(lb / n).toFixed(2) : lb, desc: 'Imported from D&D Beyond.' } });
    }
  };
  for (const [i, k] of numbered(F, /^Eq Name(\d+)$/)) addItem(F[k], get(`Eq Qty${i}`), get(`Eq Weight${i}`), false);
  for (const [i, k] of numbered(F, /^Attuned Name(\d+)$/)) addItem(F[k], get(`Attuned Qty${i}`), get(`Attuned Weight${i}`) || get(`AttunedWeight${i}`), true);
  for (const k of ['cp', 'sp', 'ep', 'gp', 'pp']) c.currency[k] = toInt(String(get(k.toUpperCase())).replace(/,/g, '')) || 0;

  // Weapon Mastery: D&D Beyond lists the mastered weapons as picks; otherwise use the weapons on the attack list.
  const mastery = cls?.choices?.find((ch) => ch.type === 'weapon-mastery' && totalLevel >= ch.level);
  if (mastery) {
    const n = Array.isArray(mastery.count) ? mastery.count[totalLevel - 1] : typeof mastery.count === 'function' ? mastery.count(totalLevel) : mastery.count;
    const max = Number(n) || 2;
    const own = (entries.find((e) => norm(e.name) === 'weapon mastery')?.picks || []).map((p) => findByName('items', p)).filter((it) => it?.type === 'weapon');
    const fromInv = c.inventory.map((e) => getItem(e.itemId)).filter((it) => it?.type === 'weapon' && weaponNames.has(norm(it.name)));
    c.classChoices.masteries = [...new Set([...own, ...fromInv].map((it) => it.id))].slice(0, max);
  }

  // Attack rows on the sheet (weapons and attack spells)
  const wpnRows = [['', 'Wpn Name', 'Wpn1 AtkBonus', 'Wpn1 Damage'], ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => [n, `Wpn Name ${n}`, `Wpn${n} AtkBonus`, `Wpn${n} Damage`])]
    .map(([, nk, bk, dk]) => ({ name: get(nk), bonus: toInt(get(bk)), damage: get(dk) })).filter((w) => w.name);
  if (allPicks.some((p) => /pact of the blade/i.test(p)) || entries.some((e) => /pact of the blade/i.test(e.name))) {
    const chaAtk = toInt(get('CHA')) !== null ? Math.floor((toInt(get('CHA')) - 10) / 2) : null;
    const pbSheet = toInt(get('ProfBonus'));
    for (const w of wpnRows) {
      const e = c.inventory.find((x) => !x.pact && getItem(x.itemId)?.type === 'weapon' && norm(getItem(x.itemId).name) === norm(w.name));
      if (!e || chaAtk === null || w.bonus !== chaAtk + pbSheet || getItem(e.itemId).kind !== 'melee') continue;
      // Only a pact weapon if its normal attack bonus doesn't already explain the sheet's number.
      const normal = compute(normalize(structuredClone(c))).attacks.find((a) => norm(a.name) === norm(w.name));
      if (normal && normal.bonus === w.bonus) continue;
      e.pact = true; e.equipped = true;
    }
  }

  // Armor: try equipping the armor and shield combination that reproduces the sheet's AC.
  const sheetAC = toInt(get('AC'));
  const armorIdx = c.inventory.map((e, i) => [e, i]).filter(([e]) => getItem(e.itemId)?.type === 'armor');
  if (armorIdx.length && sheetAC) {
    const bodies = [null, ...armorIdx.filter(([e]) => getItem(e.itemId).armorType !== 'shield').map(([, i]) => i)];
    const shields = [null, ...armorIdx.filter(([e]) => getItem(e.itemId).armorType === 'shield').map(([, i]) => i)];
    let best = null;
    for (const b of bodies) for (const s of shields) {
      const t = normalize(structuredClone(c)); t.inventory.forEach((e, i) => { if (getItem(e.itemId)?.type === 'armor') e.equipped = i === b || i === s; });
      if (compute(t).ac === sheetAC) { best = [b, s]; break; }
    }
    if (best) c.inventory.forEach((e, i) => { if (getItem(e.itemId)?.type === 'armor') e.equipped = i === best[0] || i === best[1]; });
  }

  // Hit points & status
  const sheetHP = toInt(get('MaxHP'));
  const cur = toInt(get('CurrentHP')); if (cur !== null) c.hp.current = cur;
  const temp = toInt(get('TempHP')); if (temp) c.hp.temp = temp;
  c.heroicInspiration = !!get('Inspiration');

  // Compare with the sheet and fix what can be fixed.
  let d = compute(normalize(structuredClone(c)));
  if (sheetHP && d.hpMax !== sheetHP) { c.hpBonus = sheetHP - d.hpMax; d = compute(normalize(structuredClone(c))); report.notes.push(`Max HP adjusted by ${fmt(c.hpBonus)} to match the sheet (${sheetHP}).`); }
  const diff = (label, sheet, ours, signed = false) => {
    if (sheet === null || sheet === undefined || Number(sheet) === Number(ours)) return;
    const f = (n) => (signed ? fmt(n) : String(n));
    report.diffs.push({ label, sheet: f(sheet), ours: f(ours) });
  };
  diff('Armor Class', sheetAC, d.ac);
  diff('Initiative', toInt(get('Init')), d.initiative, true);
  diff('Proficiency Bonus', toInt(get('ProfBonus')), d.pb, true);
  diff('Speed', toInt(get('Speed')), d.speed);
  diff('Passive Perception', toInt(get('Passive1')), d.passivePerception);
  for (const a of ABILITIES) {
    diff(`${a.name} save`, toInt(get(`ST ${a.name}`)), d.saves[a.id].mod, true);
    diff(a.name, toInt(get(ABIL_FIELDS[a.id])), d.scores[a.id]);
  }
  for (const s of SKILLS) diff(s.name, sheetSkill(s.id), d.skills[s.id].mod, true);
  const seenAtk = {};
  for (const w of wpnRows) {
    const n = (seenAtk[norm(w.name)] = (seenAtk[norm(w.name)] || 0) + 1);
    const ours = d.attacks.filter((x) => norm(x.name) === norm(w.name))[n - 1];
    if (ours) { diff(`${w.name} to hit`, w.bonus, ours.bonus, true); continue; }
    const sp = findByName('spells', w.name);
    if (sp && d.spellcasting && sp.attack) diff(`${w.name} to hit`, w.bonus, d.spellcasting.attack, true);
  }
  if (d.spellcasting) {
    diff('Spell save DC', toInt(get('spellSaveDC0')), d.spellcasting.dc);
    diff('Spell attack bonus', toInt(get('spellAtkBonus0')), d.spellcasting.attack, true);
  }

  // Notes: what was carried over by name only.
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const lines = [`Imported from D&D Beyond on ${ymd}. The import isn't perfect: some information may be missing or different, so compare this character with the D&D Beyond version and add or fix anything that's missing or wrong.`];
  if (classes.length > 1) lines.push(`Classes on the original sheet: ${classes.map((x) => `${x.name}${x.sub ? ` (${x.sub})` : ''} ${x.level}`).join(' / ')}.`);
  const miss = report.missing.filter((m) => m.kind !== 'Spell');
  if (miss.length) lines.push(`Not in your content: ${miss.map((m) => `${m.kind} ${m.name}`).join('; ')}.`);
  const TIME = { '1A': '1 action', '1BA': '1 bonus action', '1R': '1 reaction', '1M': '1 minute', '10M': '10 minutes', '1H': '1 hour' };
  if (spellMissing.length) lines.push(`Spells not in your content:\n${spellMissing.map((r) => `• ${r.name} (${[r.source, TIME[r.time] || r.time, r.range, r.comp, r.duration, r.page].filter(Boolean).join(', ')})`).join('\n')}`);
  if (otherWeapons.length) lines.push(`Other weapon proficiencies: ${otherWeapons.join(', ')}.`);
  if (pl.other.length) lines.push(`Other proficiencies: ${pl.other.join(', ')}.`);
  if (get('Defenses')) lines.push(`Defenses: ${get('Defenses')}`);
  if (get('SaveModifiers')) lines.push(`Save modifiers: ${get('SaveModifiers')}`);
  if (get('AdditionalSenses')) lines.push(`Senses: ${get('AdditionalSenses')}`);
  det.notes = [lines.join('\n\n'), ddbNotes].filter(Boolean).join('\n\n');

  const nItems = c.inventory.length; const nSpells = c.spells.cantrips.length + c.spells.prepared.length + c.extras.spells.length + Object.values(c.featChoices).reduce((s, ch) => s + (ch.cantrips?.length || 0) + (ch.spell?.length || 0), 0);
  report.summary = `Level ${totalLevel} ${d.species?.name || raceName} ${d.cls?.name || main?.name || ''}${d.sub ? ` (${d.sub.name})` : ''} · ${nSpells} spells · ${nItems} items`;
  report.unmatchedItems = invMissing;
  const ctx = collect ? { F, get, entries, classes, main, totalLevel, cls, subEntry, species, c, make, wpnRows, saveMarks: ABILITIES.filter((a) => get(`${a.name.slice(0, 3)}Prof`)).map((a) => a.id), pl } : null;
  return { character: normalize(c), report, ctx };
}

// ------------------------------------------------------------------ placeholders
// Anything the sheet has that your content doesn't is created as a placeholder entry, filled in from
// the sheet (features text, proficiencies, hit die, spell slots, speed…). They are saved to My Homebrew,
// tagged as imported, so they work everywhere and can be edited like any homebrew.
export const IMPORT_TAG = 'ddb';
const SOURCE = 'D&D Beyond import';
const NOISE = /^(\d+\s*\/\s*(short|long)\s+rest|special|\d+\s+(minute|hour|action|bonus action|reaction)s?|no action|[a-z]+-\d{4}|[A-Z]{2,}[\w-]*(\s+\d+)?)$/i;
const pickText = (e) => {
  const withText = (e.options || []).filter((o) => o.body);
  const plain = (e.options || []).filter((o) => !o.body).map((o) => o.name).filter((p) => !NOISE.test(p));
  return [plain.length ? `${e.body ? '\n\n' : ''}**Selected:** ${plain.join(' · ')}` : '', ...withText.map((o) => `\n\n**${o.name}.** ${o.body}`)].join('');
};
// Full sheet text goes in `desc` (what the Homebrew forms edit), so changes made there always show.
const toFeature = (e, level) => ({ level, name: e.name, desc: `${e.body}${pickText(e)}`.trim() || 'Imported from D&D Beyond.', ref: e.ref || undefined });
const pageOf = (e) => toInt(String(e.ref || '').split(' ').pop());
const SKIP_FEATURE = /^(ability score improvement|epic boon|core .+ traits)$/i;
const TIME = { '1A': '1 action', '1BA': '1 bonus action', '1R': '1 reaction', '1M': '1 minute', '10M': '10 minutes', '1H': '1 hour', '8H': '8 hours' };
const tag = (e) => ({ ...e, imported: IMPORT_TAG, sourceName: SOURCE });

function resourcesFrom(list) {
  const out = [];
  for (const e of list) for (const p of e.picks) {
    const m = p.match(/^(\d+)\s*\/\s*(Short|Long)\s+Rest/i);
    if (m) out.push({ id: slug(e.name), name: e.name, reset: m[2].toLowerCase(), uses: Number(m[1]) });
  }
  return out;
}

function buildPlaceholders(ctx) {
  const { get, entries, main, totalLevel, cls, subEntry, species, c, make, saveMarks, pl } = ctx;
  const content = {}; const list = [];
  const add = (kind, e, label) => { (content[kind] ||= []).push(tag(e)); list.push({ kind: label, name: e.name }); };
  const classSection = main ? `${main.name.toUpperCase()} FEATURES` : null;
  const classEntries = entries.filter((e) => e.section === classSection && !SKIP_FEATURE.test(e.name));
  const subIdx = subEntry ? classEntries.indexOf(subEntry) : -1;
  const subPage = subEntry ? pageOf(subEntry) : null;
  // A feature belongs to the subclass if it comes after the subclass pick and sits several pages later in its book
  // (or, for a class we know, isn't one of that class's own features).
  const known = new Set((cls?.features || []).map((f) => norm(f.name)));
  const isSubFeature = (e, i) => {
    if (e === subEntry || subIdx < 0 || i < subIdx) return false;
    if (cls) return !known.has(norm(e.name));
    const pg = pageOf(e); return subPage === null || pg === null ? true : Math.abs(pg - subPage) > 3;
  };
  const classId = cls?.id || (make.cls ? `ddb-${slug(make.cls)}` : null);

  if (make.cls) {
    const hd = toInt((get('Total').match(/d(\d+)/) || [])[1]) || 8;
    const casting = norm(get('spellCastingClass0')) === norm(make.cls);
    const slots = [];
    for (let k = 0; k < 10; k++) { const lv = toInt(get(`spellHeader${k}`)); const n = toInt(get(`spellSlotHeader${k}`)); if (lv && n) slots[lv - 1] = n; }
    const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
    const type = same(slots, FULL_CASTER_SLOTS[totalLevel - 1]) ? 'full' : same(slots, FULL_CASTER_SLOTS[Math.ceil(totalLevel / 2) - 1]) ? 'half' : 'full';
    const rows = ctx.F; const classRows = Object.keys(rows).filter((k) => /^spellSource\d+$/.test(k) && norm(rows[k]) === norm(make.cls));
    const nCantrips = classRows.filter((k) => { const i = k.slice(11); const sp = findByName('spells', rows[`spellName${i}`]); return sp ? sp.level === 0 : false; }).length
      + make.spells.filter((r) => r.level === 0 && norm(r.source) === norm(make.cls)).length;
    const nLeveled = classRows.length - nCantrips;
    const ab = ABIL_NAMES[{ STR: 'strength', DEX: 'dexterity', CON: 'constitution', INT: 'intelligence', WIS: 'wisdom', CHA: 'charisma' }[get('spellCastingAbility0').toUpperCase()]];
    const ARM = { 'light armor': 'light', 'medium armor': 'medium', 'heavy armor': 'heavy', shields: 'shield' };
    const WPN = { 'simple weapons': 'simple', 'martial weapons': 'martial' };
    const own = classEntries.filter((e, i) => !isSubFeature(e, i) && e !== subEntry);
    add('classes', {
      id: classId, name: make.cls, hitDie: hd, primary: [ab || 'str'], saves: saveMarks.length ? saveMarks : ['str', 'con'],
      tagline: 'Imported from a D&D Beyond character sheet.', desc: `Placeholder created from ${c.name}'s D&D Beyond sheet. Features are listed as they appeared there; add level details and anything missing on the Homebrew page.`,
      skillChoices: { count: 2, from: 'any' }, armor: pl.armor.map((a) => ARM[norm(a)]).filter(Boolean), weapons: pl.weapons.map((w) => WPN[norm(w)]).filter(Boolean), tools: [],
      asiLevels: [4, 8, 12, 16], subclassLevel: Math.min(3, totalLevel), resources: resourcesFrom(own), choices: [],
      caster: casting && ab ? { type, ability: ab, list: classId, cantrips: Array(20).fill(nCantrips), prepared: Array(20).fill(nLeveled) } : null,
      equipment: [], subclasses: [],
      features: own.map((e) => toFeature(e, 1)),
    }, 'Class');
  }
  if (make.sub && classId) {
    const lvl = Math.min(cls?.subclassLevel || 3, totalLevel);
    const feats = classEntries.filter(isSubFeature);
    add('subclasses', { id: `ddb-${slug(make.sub)}`, classId, name: make.sub, desc: `Placeholder created from ${c.name}'s D&D Beyond sheet.`, features: feats.map((e) => toFeature(e, lvl)), resources: resourcesFrom(feats) }, 'Subclass');
  }
  if (make.species) {
    const traits = entries.filter((e) => /SPECIES|RACIAL|RACE/.test(e.section));
    const dv = toInt((get('AdditionalSenses').match(/darkvision\s*(\d+)/i) || [])[1]) || toInt((traits.find((t) => /darkvision/i.test(t.name))?.body.match(/(\d+)\s*f(ee)?t/) || [])[1]) || 0;
    const skillName = (id) => SKILLS.find((x) => x.id === id)?.name || id;
    const chosen = (e) => (/one skill of your choice/i.test(e.body) && c.extras.skills.length ? c.extras.skills.map(skillName).join(', ')
      : /resistance to your choice/i.test(e.body) && c.extras.resist.length ? c.extras.resist.map((r) => r[0].toUpperCase() + r.slice(1)).join(', ')
        : /medium or small/i.test(e.body) && get('SIZE') ? get('SIZE') : null);
    add('species', { id: `ddb-${slug(make.species)}`, name: make.species, desc: `Placeholder created from ${c.name}'s D&D Beyond sheet.`, size: get('SIZE') || 'Medium', speed: toInt(get('Speed')) || 30, darkvision: dv,
      traits: traits.map((e) => { const f = toFeature(e, 1); const ch = chosen(e); if (ch) f.desc += `\n\n**Chosen:** ${ch}`; return f; }), choices: [] }, 'Species');
  }
  if (make.bg) {
    const bgEntries = entries.filter((e) => /BACKGROUND/.test(e.section));
    add('backgrounds', { id: `ddb-${slug(make.bg)}`, name: make.bg, desc: [`Placeholder created from ${c.name}'s D&D Beyond sheet.`, ...bgEntries.map((e) => `**${e.name}.** ${e.body}${pickText(e)}`)].join('\n\n'),
      skills: c.extras.skills.slice(0, 2), abilities: [], anyAbilities: true, feat: { choose: true }, equipment: [] }, 'Background');
  }
  for (const e of make.feats) {
    add('feats', { id: `ddb-${slug(e.name)}`, name: e.name, category: 'general', desc: `${e.body}${pickText(e)}`.trim() || 'Imported from D&D Beyond.', ref: e.ref || undefined }, 'Feat');
  }
  const seen = new Set();
  for (const r of make.spells) {
    const id = `ddb-${slug(r.name)}`; if (seen.has(id)) continue; seen.add(id);
    const sh = String(r.saveHit || ''); const save = ABIL_NAMES[{ STR: 'strength', DEX: 'dexterity', CON: 'constitution', INT: 'intelligence', WIS: 'wisdom', CHA: 'charisma' }[(sh.match(/\b(STR|DEX|CON|INT|WIS|CHA)\b/) || [])[1]]];
    const fromClass = classId && (norm(r.source) === norm(main?.name) || /spellbook/i.test(r.source));
    const wr = (ctx.wpnRows || []).find((w) => norm(w.name) === norm(r.name));
    const wd = wr && String(wr.damage).match(/^(\d+d\d+)(?:\s*[+-]\s*\d+)?\s+([A-Za-z]+)/);
    add('spells', {
      id, name: r.name, level: r.level, school: 'Unknown', time: TIME[r.time] || r.time || '', range: r.range || '', components: r.comp || '', duration: r.duration || '',
      concentration: /concentration|^c\b/i.test(r.duration || ''), ritual: false, classes: fromClass ? [classId] : [],
      save: save || undefined, attack: /^[+-]\d/.test(sh) || /\/\s*[+-]\d/.test(sh) || undefined,
      damage: wd ? `${wd[1]} ${wd[2].toLowerCase()}` : undefined,
      desc: `Imported from D&D Beyond${r.page ? ` (${r.page})` : ''}. The PDF doesn't include the spell's description, so add it on the Homebrew page.`,
    }, 'Spell');
  }
  return { content, list };
}

/**
 * Convert D&D Beyond PDF fields into an Infinity Codex character. Anything not in your content becomes a
 * placeholder (returned as `placeholders`, pass it to commitPlaceholders when the user confirms).
 */
export function fromDdbFields(rawFields, { now = new Date(), placeholders = true } = {}) {
  setTransientPacks([]);
  const first = convert(rawFields, { now, collect: placeholders });
  const m = first.ctx?.make;
  if (!placeholders || !m || !(m.cls || m.sub || m.species || m.bg || m.feats.length || m.spells.length)) return { character: first.character, report: { ...first.report, created: [] }, placeholders: null };
  const built = buildPlaceholders(first.ctx);
  setTransientPacks([{ id: 'ddb-pending', name: SOURCE, content: built.content }]);
  const second = convert(rawFields, { now });
  // Keep the first pass's notes about rejected look-alikes (e.g. a same-named spell at another level).
  const notes = [...new Set([...first.report.notes.filter((n) => /different level/.test(n)), ...second.report.notes])];
  return { character: second.character, report: { ...second.report, notes, created: built.list }, placeholders: built.content };
}

/** Save placeholders into My Homebrew (replacing earlier imports with the same id) and drop the preview copy. */
export function commitPlaceholders(content) {
  setTransientPacks([]);
  if (!content) return;
  const packs = loadPacks();
  const my = packs.find((p) => p.id === 'my-homebrew') || { id: 'my-homebrew', name: 'My Homebrew', version: '1.0.0', author: '', enabled: true, content: {} };
  for (const [kind, entries] of Object.entries(content)) {
    const list = (my.content[kind] ||= []);
    for (const e of entries) { const clean = { ...e }; delete clean.source; delete clean.packId; const i = list.findIndex((x) => x.id === e.id); if (i >= 0) list[i] = clean; else list.push(clean); }
  }
  savePacks([...packs.filter((p) => p.id !== 'my-homebrew'), my]);
  resetImportCache();
}
export const discardPlaceholders = () => { setTransientPacks([]); resetImportCache(); };

/** Read a D&D Beyond PDF (ArrayBuffer/Uint8Array) and convert it (with placeholders for anything missing). */
export async function importDdbPdf(bytes) {
  const { fields } = await readPdfFields(bytes);
  if (!looksLikeDdb(fields)) {
    const n = Object.values(fields).filter(Boolean).length;
    throw new Error(n ? 'This PDF has form fields, but it doesn’t look like a D&D Beyond character sheet.' : 'This PDF has no form fields. Export again from D&D Beyond with “Export to PDF” (not Print to PDF).');
  }
  return fromDdbFields(fields);
}
