// Dice roller. Supports expressions like "1d20+5", "2d6+3", "4d6kh3", "8d6".
const rand = (sides) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
};

export function roll(expr, { advantage = 0 } = {}) {
  const clean = String(expr).replace(/\s+/g, '').toLowerCase();
  const terms = clean.match(/[+-]?[^+-]+/g) || [];
  let total = 0;
  const parts = [];
  for (const raw of terms) {
    const sign = raw.startsWith('-') ? -1 : 1;
    const term = raw.replace(/^[+-]/, '');
    const m = term.match(/^(\d*)d(\d+)(k[hl]\d+)?$/);
    if (m) {
      let count = parseInt(m[1] || '1', 10);
      const sides = parseInt(m[2], 10);
      let keep = m[3];
      if (sides === 20 && count === 1 && advantage) { count = 2; keep = advantage > 0 ? 'kh1' : 'kl1'; }
      const rolls = Array.from({ length: Math.min(count, 100) }, () => rand(sides));
      let keptIdx = rolls.map((_, i) => i);
      if (keep) {
        const n = parseInt(keep.slice(2), 10);
        keptIdx = keptIdx.sort((a, b) => (keep[1] === 'h' ? rolls[b] - rolls[a] : rolls[a] - rolls[b])).slice(0, n);
      }
      const kept = keptIdx.map((i) => rolls[i]);
      const sum = kept.reduce((a, b) => a + b, 0) * sign;
      total += sum;
      parts.push({ dice: `${count}d${sides}`, rolls, kept, keptIdx, sign, sides });
    } else if (/^\d+$/.test(term)) {
      total += sign * parseInt(term, 10);
      parts.push({ flat: sign * parseInt(term, 10) });
    }
  }
  const d20 = parts.find((p) => p.sides === 20 && p.kept?.length === 1);
  return { expr, total, parts, crit: d20?.kept[0] === 20, fumble: d20?.kept[0] === 1 };
}

export function describe(result) {
  return result.parts.map((p) => (p.flat !== undefined ? (p.flat >= 0 ? `+${p.flat}` : `${p.flat}`)
    : `${p.sign < 0 ? '-' : ''}[${p.rolls.map((r, i) => (p.keptIdx.includes(i) ? r : `(${r})`)).join(', ')}]`)).join(' ');
}
