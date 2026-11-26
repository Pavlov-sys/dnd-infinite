// Homebrew import: recognise what was pasted/dropped and turn it into an Infinity Codex content pack.
// Supported: Infinity Codex packs, single entries or arrays of entries, and 5etools homebrew JSON
// (spells, feats, backgrounds, races, subclasses, items, monsters). Pure functions — no DOM.

const KINDS = ['classes', 'subclasses', 'species', 'backgrounds', 'feats', 'spells', 'items', 'monsters'];
export const slug = (s) => String(s || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Guess the content type of a bare entry from its fields. */
export function guessKind(e) {
  if (!e || typeof e !== 'object') return null;
  if (e.kind && KINDS.includes(e.kind)) return e.kind;
  if (e.classId && e.features) return 'subclasses';
  if (e.hitDie && e.features) return 'classes';
  if (e.scores && (e.actions || e.cr !== undefined)) return 'monsters';
  if (e.school !== undefined && e.level !== undefined) return 'spells';
  if (e.traits && e.speed !== undefined) return 'species';
  if (e.skills && (e.feat || e.abilities)) return 'backgrounds';
  if (e.category && ['origin', 'general', 'fighting-style', 'epic-boon'].includes(e.category)) return 'feats';
  if (['weapon', 'armor', 'gear', 'magic-item'].includes(e.type)) return 'items';
  return null;
}

/**
 * Parse any supported JSON into { pack, format, warnings }.
 * `pack` is always a valid Infinity Codex pack object (may be empty).
 */
export function parseImport(input, fallbackName = 'Imported homebrew') {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const warnings = [];
  // Character files are handled elsewhere.
  if (data && (data.format === 'dnd-infinite-character' || data.format === 'questwright-character')) {
    return { format: 'character', pack: null, warnings: ['This is a character file. Import it from My Characters instead.'] };
  }
  // Native pack
  if (data && data.content && typeof data.content === 'object') {
    return { format: 'pack', pack: { id: data.id || slug(data.name || fallbackName), name: data.name || fallbackName, version: data.version || '1.0.0', author: data.author || '', license: data.license || '', description: data.description || '', content: data.content }, warnings };
  }
  // 5etools homebrew
  if (data && (data._meta || ['spell', 'feat', 'background', 'race', 'subclass', 'subclassFeature', 'item', 'monster', 'class'].some((k) => Array.isArray(data[k])))) {
    return fromFiveTools(data, warnings, fallbackName);
  }
  // Bare entry or array of entries
  const list = Array.isArray(data) ? data : [data];
  const content = {};
  for (const e of list) {
    const kind = guessKind(e);
    if (!kind || !e.name) { warnings.push(`Skipped an entry that doesn't look like content${e?.name ? ` ("${e.name}")` : ''}.`); continue; }
    (content[kind] ||= []).push({ ...e, id: e.id || `hb-${slug(e.name)}` });
  }
  return { format: 'entries', pack: { id: slug(fallbackName), name: fallbackName, version: '1.0.0', content }, warnings };
}

// ---------------------------------------------------------------- 5etools conversion
const ABIL = { str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' };
const SCHOOL = { A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment', V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation', P: 'Psionic' };
const SIZE = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
const DMG = { B: 'bludgeoning', P: 'piercing', S: 'slashing', A: 'acid', C: 'cold', F: 'fire', O: 'force', L: 'lightning', N: 'necrotic', I: 'poison', Y: 'psychic', R: 'radiant', T: 'thunder' };
const PROP = { A: 'Ammunition', F: 'Finesse', H: 'Heavy', L: 'Light', LD: 'Loading', R: 'Reach', T: 'Thrown', '2H': 'Two-Handed', V: 'Versatile' };
const ALIGN = { L: 'lawful', N: 'neutral', C: 'chaotic', G: 'good', E: 'evil', U: 'unaligned', A: 'any alignment' };

/** Strip 5etools inline tags like {@damage 2d6} or {@spell fireball|phb|Fireball}. */
export function untag(s) {
  let out = String(s ?? '');
  for (let i = 0; i < 4 && out.includes('{@'); i++) {
    out = out.replace(/\{@(\w+)\s*([^{}]*)\}/g, (_, tag, body) => {
      const parts = body.split('|');
      const text = parts[2] || parts[0];
      switch (tag) {
        case 'hit': return `${/^[+-]/.test(parts[0]) ? '' : '+'}${parts[0]}`;
        case 'dc': return `DC ${parts[0]}`;
        case 'h': return 'Hit: ';
        case 'atk': return ({ mw: 'Melee Weapon Attack:', rw: 'Ranged Weapon Attack:', 'mw,rw': 'Melee or Ranged Weapon Attack:', ms: 'Melee Spell Attack:', rs: 'Ranged Spell Attack:' }[parts[0]] || 'Attack:');
        case 'recharge': return `(Recharge ${parts[0] || 6}–6)`;
        case 'chance': return `${parts[0]}%`;
        default: return text;
      }
    });
  }
  return out;
}

/** Flatten 5etools "entries" into Infinity Codex rules text. */
export function flatten(entries, depth = 0) {
  if (entries == null) return '';
  if (typeof entries === 'string') return untag(entries);
  if (Array.isArray(entries)) return entries.map((e) => flatten(e, depth)).filter(Boolean).join('\n');
  const e = entries;
  switch (e.type) {
    case 'list': return (e.items || []).map((it) => `- ${typeof it === 'string' ? untag(it) : it.name ? `**${untag(it.name)}.** ${flatten(it.entry || it.entries, depth + 1)}` : flatten(it, depth + 1)}`).join('\n');
    case 'table': return [e.caption ? `**${untag(e.caption)}**` : '', (e.colLabels || []).map(untag).join(' | '), ...(e.rows || []).map((r) => (Array.isArray(r) ? r : r.row || []).map((c) => (typeof c === 'object' ? flatten(c.roll ? `${c.roll.exact ?? `${c.roll.min}–${c.roll.max}`}` : c.entry || c) : untag(c))).join(' | '))].filter(Boolean).join('\n');
    case 'item': return `**${untag(e.name)}.** ${flatten(e.entry || e.entries, depth + 1)}`;
    case 'quote': return flatten(e.entries, depth + 1) + (e.by ? ` — ${e.by}` : '');
    default: {
      const body = flatten(e.entries || e.entry || e.items, depth + 1);
      return e.name ? `**${untag(e.name)}.** ${body}` : body;
    }
  }
}
const firstLine = (t) => (t || '').replace(/\*\*/g, '').split('\n')[0].slice(0, 170);

function ftSpell(s) {
  const time = (s.time || []).map((t) => `${t.number} ${t.unit === 'action' ? 'Action' : t.unit === 'bonus' ? 'Bonus Action' : t.unit === 'reaction' ? 'Reaction' : t.unit + (t.number > 1 ? 's' : '')}`).join(' or ') || 'Action';
  const r = s.range || {};
  const range = r.type === 'special' ? 'Special' : r.distance ? (['self', 'touch', 'sight', 'unlimited'].includes(r.distance.type) ? r.distance.type.replace(/^./, (c) => c.toUpperCase()) : `${r.distance.amount} ${r.distance.type}`) : '';
  const c = s.components || {};
  const components = [c.v && 'V', c.s && 'S', c.m && `M${typeof c.m === 'string' ? ` (${untag(c.m)})` : c.m?.text ? ` (${untag(c.m.text)})` : ''}`].filter(Boolean).join(', ');
  const d = (s.duration || [])[0] || {};
  const duration = d.type === 'instant' ? 'Instantaneous' : d.type === 'permanent' ? 'Until dispelled' : d.type === 'special' ? 'Special' : d.duration ? `${d.concentration ? 'Concentration, up to ' : ''}${d.duration.amount} ${d.duration.type}${d.duration.amount > 1 ? 's' : ''}` : '';
  const classes = [...new Set([...(s.classes?.fromClassList || []), ...(s.classes?.fromClassListVariant || [])].map((x) => slug(x.name)))];
  const text = flatten(s.entries);
  const dmg = text.match(/(\d+d\d+)[^.]*?\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\b/i);
  const save = (s.savingThrow || [])[0];
  return { id: `hb-${slug(s.name)}`, name: s.name, level: s.level || 0, school: SCHOOL[s.school] || s.school || '', time, range, components, duration,
    classes, desc: text, higherLevel: flatten(s.entriesHigherLevel).replace(/^\*\*[^*]+\*\*\s*/, '') || undefined,
    concentration: !!d.concentration, ritual: !!s.meta?.ritual, damage: dmg ? `${dmg[1]} ${dmg[2].toLowerCase()}` : undefined,
    save: save ? ABIL[save.slice(0, 3).toLowerCase()] : undefined, attack: !!(s.spellAttack && s.spellAttack.length) };
}

function ftFeat(f) {
  const text = flatten(f.entries);
  const choices = [];
  const ab = (f.ability || [])[0];
  if (ab?.choose?.from) choices.push({ id: 'ability', type: 'ability-plus1', options: ab.choose.from.map((x) => ABIL[x]).filter(Boolean) });
  else if (ab) { const k = Object.keys(ab).find((x) => ABIL[x]); if (k) choices.push({ id: 'ability', type: 'ability-plus1', options: [k] }); }
  const pre = (f.prerequisite || []).map((p) => Object.entries(p).map(([k, v]) => (k === 'ability' ? v.map((a) => Object.entries(a).map(([x, n]) => `${x.toUpperCase()} ${n}`).join(' or ')).join(', ') : k === 'level' ? `Level ${v.level || v}` : k === 'spellcasting' || k === 'spellcasting2020' ? 'Spellcasting feature' : k === 'other' ? v : typeof v === 'string' ? v : k)).join(', ')).join('; ');
  return { id: `hb-${slug(f.name)}`, name: f.name, category: f.category === 'O' ? 'origin' : f.category === 'FS' ? 'fighting-style' : f.category === 'EB' ? 'epic-boon' : 'general', prereq: pre || undefined, desc: firstLine(text), text, choices };
}

function ftBackground(b) {
  const skills = Object.keys((b.skillProficiencies || [])[0] || {}).filter((k) => k !== 'choose' && k !== 'any').map((k) => slug(k)).slice(0, 2);
  const tool = Object.keys((b.toolProficiencies || [])[0] || {}).filter((k) => k !== 'choose').join(', ');
  const text = flatten(b.entries);
  return { id: `hb-${slug(b.name)}`, name: b.name, abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha'], anyAbilities: true, feat: { choose: true }, skills, tool,
    desc: firstLine(text), text, equipment: [{ id: 'A', label: 'Listed gear', items: [], gp: 10, note: 'See the background description.' }, { id: 'B', label: 'Gold', items: [], gp: 50 }] };
}

function ftRace(r) {
  const traits = [];
  for (const e of r.entries || []) if (e && typeof e === 'object' && e.name && !/^(Age|Alignment|Size|Speed|Languages|Ability Score Increase)$/i.test(e.name)) traits.push({ name: untag(e.name), level: 1, desc: firstLine(flatten(e.entries)), text: flatten(e.entries) });
  const speed = typeof r.speed === 'number' ? r.speed : r.speed?.walk || 30;
  return { id: `hb-${slug(r.name)}`, name: r.name, size: SIZE[(r.size || ['M'])[0]] || 'Medium', speed, darkvision: r.darkvision || 0, desc: firstLine(flatten(r.entries)) || r.name,
    text: (r.ability ? 'Under the 2024 rules your ability score increases come from your background.\n' : '') + (r.fluff ? flatten(r.fluff.entries) : ''), traits, choices: [], resist: (r.resist || []).filter((x) => typeof x === 'string') };
}

function ftItem(i) {
  const text = flatten(i.entries);
  const base = { id: `hb-${slug(i.name)}`, name: i.name, cost: (i.value || 0) / 100, weight: i.weight || 0, desc: text };
  const t = String(i.type || '').split('|')[0];
  const magic = i.rarity && i.rarity !== 'none';
  if (magic) return { ...base, type: 'magic-item', category: i.wondrous ? 'Wondrous Items' : t === 'P' ? 'Potions' : t === 'RG' ? 'Rings' : t === 'WD' ? 'Wands' : t === 'RD' ? 'Rods' : t === 'SC' ? 'Scrolls' : t === 'ST' ? 'Staffs' : ['M', 'R'].includes(t) ? 'Weapons' : ['LA', 'MA', 'HA', 'S'].includes(t) ? 'Armor' : 'Wondrous Items',
    rarity: String(i.rarity).replace(/\b\w/g, (c) => c.toUpperCase()), attunement: !!i.reqAttune };
  if (t === 'M' || t === 'R') return { ...base, type: 'weapon', category: i.weaponCategory === 'simple' ? 'simple' : 'martial', kind: t === 'R' ? 'ranged' : 'melee', damage: i.dmg1 || '1d6', dtype: DMG[i.dmgType] || 'slashing', props: (i.property || []).map((p) => PROP[String(p).split('|')[0]]).filter(Boolean), versatile: i.dmg2, range: i.range };
  if (['LA', 'MA', 'HA', 'S'].includes(t)) return { ...base, type: 'armor', armorType: { LA: 'light', MA: 'medium', HA: 'heavy', S: 'shield' }[t], ac: i.ac || (t === 'S' ? 2 : 11), strReq: i.strength ? Number(i.strength) : undefined, stealthDis: !!i.stealth };
  return { ...base, type: 'gear' };
}

function ftMonster(m) {
  const ac = Array.isArray(m.ac) ? (typeof m.ac[0] === 'object' ? m.ac[0].ac : m.ac[0]) : m.ac;
  const speed = Object.entries(m.speed || {}).filter(([k]) => k !== 'canHover').map(([k, v]) => `${k === 'walk' ? '' : `${k} `}${typeof v === 'object' ? v.number : v} ft.`).join(', ');
  const acts = (lst) => (lst || []).map((a) => ({ name: untag(a.name || ''), desc: flatten(a.entries) }));
  const align = (m.alignment || []).map((a) => (typeof a === 'string' ? ALIGN[a] || a : '')).filter(Boolean).join(' ');
  const cr = typeof m.cr === 'object' ? m.cr.cr : m.cr;
  const crNum = cr === '1/8' ? 0.125 : cr === '1/4' ? 0.25 : cr === '1/2' ? 0.5 : Number(cr) || 0;
  return { id: `hb-${slug(m.name)}`, name: m.name, size: SIZE[(m.size || ['M'])[0]] || 'Medium', kind: typeof m.type === 'object' ? m.type.type : m.type || '', alignment: align,
    ac, hp: m.hp?.average, hitDice: m.hp?.formula, speed, scores: ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((k) => m[k] ?? 10),
    saves: Object.fromEntries(Object.entries(m.save || {}).map(([k, v]) => [k, Number(v)])), skills: Object.fromEntries(Object.entries(m.skill || {}).map(([k, v]) => [k.replace(/\b\w/g, (c) => c.toUpperCase()), Number(v)])),
    resist: (m.resist || []).filter((x) => typeof x === 'string'), immune: (m.immune || []).filter((x) => typeof x === 'string'), conditionImmune: (m.conditionImmune || []).filter((x) => typeof x === 'string'),
    senses: [...(m.senses || []), m.passive ? `passive Perception ${m.passive}` : ''].filter(Boolean).join(', '), languages: (m.languages || []).join(', ') || '—', cr: crNum,
    traits: acts(m.trait), actions: acts(m.action), bonusActions: acts(m.bonus), reactions: acts(m.reaction), legendary: acts(m.legendary) };
}

function fromFiveTools(data, warnings, fallbackName) {
  const src = data._meta?.sources?.[0];
  const content = {};
  const put = (kind, list, fn) => { if (list?.length) content[kind] = list.map((x) => { try { return fn(x); } catch { warnings.push(`Couldn't convert "${x?.name}".`); return null; } }).filter(Boolean); };
  put('spells', data.spell, ftSpell);
  put('feats', data.feat, ftFeat);
  put('backgrounds', data.background, ftBackground);
  put('species', [...(data.race || []), ...(data.species || [])], ftRace);
  put('items', [...(data.item || []), ...(data.baseitem || [])], ftItem);
  put('monsters', data.monster, ftMonster);
  if (data.subclass?.length) {
    const feats = data.subclassFeature || [];
    content.subclasses = data.subclass.map((sc) => {
      const mine = feats.filter((f) => f.subclassShortName === sc.shortName && f.className === sc.className);
      const features = mine.map((f) => {
        const text = flatten(f.entries);
        return { level: Math.max(3, f.level || 3), name: untag(f.name), desc: firstLine(text), text: (f.level && f.level < 3 ? `(Originally a level ${f.level} feature.)\n` : '') + text };
      }).filter((f) => f.text.trim() || f.name);
      // The first subclass feature usually repeats the subclass name and holds its introduction.
      const intro = features.length && features[0].name === sc.name ? features.shift() : null;
      return { id: `hb-${slug(sc.className)}-${slug(sc.shortName || sc.name)}`, classId: slug(sc.className), name: sc.name, desc: firstLine(intro?.text) || sc.name, text: intro?.text || '', features };
    });
  }
  if (data.class?.length) warnings.push(`${data.class.length} class(es) were skipped: full classes from 5etools files aren't supported yet. Their subclasses still import if they belong to an existing class.`);
  const unknownClass = (content.subclasses || []).filter((s) => !['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard', 'mechanist', 'witch', 'vanguard', 'theurge'].includes(s.classId));
  if (unknownClass.length) warnings.push(`${unknownClass.length} subclass(es) belong to classes Infinity Codex doesn't have (${[...new Set(unknownClass.map((s) => s.classId))].join(', ')}) and won't appear in the builder.`);
  const name = src?.full || src?.json || fallbackName;
  const author = (src?.authors || []).join(', ');
  return { format: '5etools', pack: { id: slug(src?.json || name), name, version: src?.version || '1.0.0', author, license: '', content }, warnings };
}

/** Counts and sample names for the import preview. */
export function summarize(pack) {
  return Object.entries(pack?.content || {}).filter(([, v]) => v?.length).map(([kind, v]) => ({ kind, count: v.length, names: v.slice(0, 8).map((e) => e.name) }));
}

/** Merge a pack's content into another (e.g. My Homebrew). Duplicate ids get a suffix. Returns counts. */
export function mergeInto(target, pack) {
  let added = 0; let renamed = 0;
  for (const [kind, list] of Object.entries(pack.content || {})) {
    const dest = (target.content[kind] ||= []);
    for (const e of list) {
      let id = e.id || `hb-${slug(e.name)}`;
      if (dest.some((x) => x.id === id)) { id = `${id}-${Math.random().toString(36).slice(2, 6)}`; renamed++; }
      dest.push({ ...e, id }); added++;
    }
  }
  return { added, renamed };
}

// ---------------------------------------------------------------- plain-text quick fill
const ORDINAL = (s) => Number(String(s).match(/\d+/)?.[0]);
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];

/**
 * Turn text copied from a PDF, wiki or GM Binder page into editor fields.
 * Returns a partial draft object for the given content type; anything it can't place goes into the description.
 */
export function parseText(type, raw) {
  const text = String(raw || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/’/g, "'").trim();
  const lines = text.split('\n').map((l) => l.trim());
  const name = (lines.shift() || '').replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
  const body = lines.join('\n').trim();
  if (type === 'spells') {
    const out = { name };
    const rest = [];
    for (const l of lines) {
      let m;
      if ((m = l.match(/^(\d)(?:st|nd|rd|th)?[- ]level (\w+)/i)) || (m = l.match(/^Level (\d) (\w+)/i))) { out.level = Number(m[1]); out.school = SCHOOLS.find((x) => x.toLowerCase() === m[2].toLowerCase()) || out.school; if (/ritual/i.test(l)) out.ritual = true; continue; }
      if ((m = l.match(/^(\w+) cantrip/i))) { out.level = 0; out.school = SCHOOLS.find((x) => x.toLowerCase() === m[1].toLowerCase()); continue; }
      if ((m = l.match(/^\**Casting Time:?\**\s*(.+)/i))) { out.time = m[1].replace(/^1 (action|bonus action|reaction)/i, (_, a) => a.replace(/\b\w/g, (c) => c.toUpperCase())); if (/ritual/i.test(m[1])) out.ritual = true; continue; }
      if ((m = l.match(/^\**Range:?\**\s*(.+)/i))) { out.range = m[1]; continue; }
      if ((m = l.match(/^\**Components?:?\**\s*(.+)/i))) { out.components = m[1]; continue; }
      if ((m = l.match(/^\**Duration:?\**\s*(.+)/i))) { out.duration = m[1]; out.concentration = /concentration/i.test(m[1]); continue; }
      if ((m = l.match(/^\**Classes?:?\**\s*(.+)/i))) { out.classes = m[1].split(/[,/]/).map((c) => slug(c.trim())).filter(Boolean); continue; }
      rest.push(l);
    }
    const desc = rest.join('\n').trim();
    const hl = desc.split(/\n?\**(?:At Higher Levels|Using a Higher-Level Spell Slot|Cantrip Upgrade)\.?\**\s*/i);
    out.desc = hl[0].trim();
    if (hl[1]) out.higherLevel = hl[1].trim();
    const dmg = out.desc.match(/(\d+d\d+)[^.]*?\b(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\b/i);
    if (dmg) out.damage = `${dmg[1]} ${dmg[2].toLowerCase()}`;
    const save = out.desc.match(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i);
    if (save) out.save = save[1].slice(0, 3).toLowerCase();
    if (/spell attack/i.test(out.desc)) out.attack = true;
    return out;
  }
  if (type === 'feats') {
    const pre = body.match(/^\**Prerequisites?:?\**\s*(.+)$/im);
    const text = body.replace(/^\**Prerequisites?:?\**.*$/im, '').trim();
    const inc = text.match(/Increase your (\w+)(?:,? or (\w+))?(?: or (\w+))? score by 1/i);
    const plusOne = inc ? inc.slice(1).filter(Boolean).map((x) => x.slice(0, 3).toLowerCase()).join(',') : undefined;
    return { name, prereq: pre?.[1], text, category: /origin feat/i.test(text) ? 'origin' : 'general', plusOne: plusOne && plusOne.split(',').length >= 6 ? 'any' : plusOne };
  }
  if (type === 'subclasses' || type === 'species') {
    // Features/traits: a short heading line, "Name (3rd level)", "Level 3: Name", or a run-in "Name. Text".
    const items = []; const intro = []; let cur = null; let lastLevel = 3;
    const push = (n, lvl, first) => { cur = { name: n.replace(/\*\*/g, '').replace(/[.:]$/, '').trim(), level: lvl, desc: first || '' }; items.push(cur); };
    for (const l of lines) {
      if (!l) continue;
      let m;
      if ((m = l.match(/^(?:#+\s*)?(?:Level\s*(\d+)|(\d+)(?:st|nd|rd|th)[- ]level)\s*[:\-–—]\s*(.+)$/i))) { push(m[3], Number(m[1] || m[2])); continue; }
      if ((m = l.match(/^(?:#+\s*)?(.{2,60}?)\s*\((\d+)(?:st|nd|rd|th)[- ]level\)\.?$/i))) { push(m[1], Number(m[2])); continue; }
      if ((m = l.match(/^\*\*(.{2,60}?)\.?\*\*\.?\s*(.*)$/)) || (m = l.match(/^([A-Z][\w'’ -]{1,40}?)\.\s+([A-Z].*)$/))) {
        if (m[1].split(' ').length <= 6) { push(m[1], lastLevel, m[2]); continue; }
      }
      if ((m = l.match(/^#+\s*(.+)$/)) || (l.length < 45 && !/[.!?:]$/.test(l) && /^[A-Z]/.test(l) && l.split(' ').length <= 6)) { push(m ? m[1] : l, lastLevel); continue; }
      if (cur) cur.desc += (cur.desc ? '\n' : '') + l; else intro.push(l);
    }
    for (const it of items) {
      const lv = it.desc.match(/\b(?:at|starting at|beginning at|when you reach)\s+(\d+)(?:st|nd|rd|th) level/i);
      if (lv && type === 'subclasses') it.level = ORDINAL(lv[1]);
      it.level = Math.max(type === 'subclasses' ? 3 : 1, it.level || 3);
      lastLevel = it.level;
    }
    const introText = intro.join('\n');
    if (type === 'species') {
      const speed = introText.match(/(\d+)\s*(?:feet|ft)/i) || body.match(/Speed[^.\d]*(\d+)/i);
      const size = body.match(/\b(Small|Medium|Large)\b/);
      const dark = body.match(/darkvision[^.\d]*(\d+)/i);
      return { name, desc: introText.split('\n')[0] || '', size: size?.[1], speed: speed ? Number(speed[1]) : undefined, darkvision: dark ? Number(dark[1]) : 0,
        traits: items.filter((t) => !/^(Size|Speed|Age|Alignment|Languages?|Ability Score Increase|Creature Type)$/i.test(t.name)).map((t) => ({ name: t.name, level: 1, desc: t.desc })) };
    }
    const first = introText.split('\n')[0]?.slice(0, 170) || '';
    return { name, desc: first, text: introText.trim() !== first.trim() ? introText : undefined, features: items.map((f) => ({ level: f.level, name: f.name, desc: f.desc })) };
  }
  return { name, desc: body, text: body };
}
