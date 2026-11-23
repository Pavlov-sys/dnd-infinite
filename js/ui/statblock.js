// Monster stat block (2024 layout). Works for SRD monsters and homebrew monsters alike.
import { h, rich } from './dom.js';
import { rollDice } from './dicelog.js';

const ABS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const mod = (s) => Math.floor((s - 10) / 2);
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const crLabel = (cr) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr ?? '—'));

/** Make dice expressions in text clickable: "12 (2d6 + 5)" and "+9" attack bonuses. */
function rollable(text, name) {
  const parts = []; let last = 0;
  const re = /(\d+) \((\d+d\d+(?: ?[+−-] ?\d+)?)\)|(Attack Roll: )([+−-]\d+)/g; let m;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    if (m[2]) { const expr = m[2].replace(/\s/g, '').replace('−', '-'); parts.push(h('button.roll-inline', { onclick: () => rollDice(`${name} damage`, expr) }, `${m[1]} (${m[2]})`)); }
    else { const b = m[4].replace('−', '-'); parts.push(m[3], h('button.roll-inline', { onclick: () => rollDice(`${name} attack`, `1d20${b}`, { d20: true }) }, m[4])); }
    last = re.lastIndex;
  }
  parts.push(text.slice(last));
  return parts;
}

const section = (title, list, intro) => (list?.length ? [h('h4.sb-section', {}, title), intro ? h('p.sb-intro', {}, intro) : null,
  list.map((a) => h('p.sb-entry', {}, h('b', {}, `${a.name}${a.usage ? ` (${a.usage.type === 'per day' ? `${a.usage.times}/Day` : a.usage.type === 'recharge on roll' ? `Recharge ${a.usage.min_value}–6` : a.usage.type})` : ''}. `), rollable(a.desc, a.name)))] : null);

export function statBlock(m) {
  const scores = m.scores || [10, 10, 10, 10, 10, 10];
  return h('div.statblock', {},
    h('div.sb-head', {}, h('h3', {}, m.name), h('div.sb-sub', {}, `${m.size || ''} ${m.kind || ''}${m.alignment ? `, ${m.alignment}` : ''}`)),
    h('div.sb-top', {},
      h('div', {}, h('b', {}, 'AC '), m.ac ?? '—', h('span.sp', {}), h('b', {}, 'Initiative '), h('button.roll-inline', { onclick: () => rollDice(`${m.name} initiative`, `1d20${sign(mod(scores[1]))}`, { d20: true }) }, sign(mod(scores[1])))),
      h('div', {}, h('b', {}, 'HP '), m.hp ?? '—', m.hitDice ? [' (', h('button.roll-inline', { onclick: () => rollDice(`${m.name} HP`, m.hitDice.replace(/\s/g, '')) }, m.hitDice), ')'] : null),
      h('div', {}, h('b', {}, 'Speed '), m.speed || '—')),
    h('table.sb-scores', {}, h('tbody', {}, h('tr', {}, ABS.map((a, i) => h('td', {},
      h('div.sb-ab', {}, a), h('div.sb-val', {}, scores[i]),
      h('button.sb-mod', { title: `${a} check`, onclick: () => rollDice(`${m.name} ${a}`, `1d20${sign(mod(scores[i]))}`, { d20: true }) }, sign(mod(scores[i]))),
      h('button.sb-save', { title: `${a} save`, onclick: () => rollDice(`${m.name} ${a} save`, `1d20${sign(m.saves?.[KEYS[i]] ?? mod(scores[i]))}`, { d20: true }) }, `save ${sign(m.saves?.[KEYS[i]] ?? mod(scores[i]))}`)))))),
    h('div.sb-props', {},
      m.skills && Object.keys(m.skills).length ? h('div', {}, h('b', {}, 'Skills '), Object.entries(m.skills).map(([k, v]) => `${k} ${sign(v)}`).join(', ')) : null,
      m.vulnerable?.length ? h('div', {}, h('b', {}, 'Vulnerabilities '), m.vulnerable.join(', ')) : null,
      m.resist?.length ? h('div', {}, h('b', {}, 'Resistances '), m.resist.join(', ')) : null,
      m.immune?.length || m.conditionImmune?.length ? h('div', {}, h('b', {}, 'Immunities '), [...(m.immune || []), ...(m.conditionImmune || [])].join(', ')) : null,
      h('div', {}, h('b', {}, 'Senses '), m.senses || '—'),
      h('div', {}, h('b', {}, 'Languages '), m.languages || '—'),
      h('div', {}, h('b', {}, 'CR '), crLabel(m.cr), m.xp ? ` (XP ${Number(m.xp).toLocaleString()}${m.pb ? `; PB ${sign(m.pb)}` : ''})` : '')),
    section('Traits', m.traits), section('Actions', m.actions), section('Bonus Actions', m.bonusActions), section('Reactions', m.reactions),
    section('Legendary Actions', m.legendary, `Legendary Action Uses: 3. Immediately after another creature's turn, the ${m.name.toLowerCase()} can expend a use to take one of the following actions.`),
    m.desc ? rich(m.desc) : null);
}
