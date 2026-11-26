// Battle damage for character cards: below half HP a card gets scuffed, scratched and bloodied.
// Everything is drawn as SVG from a seed (the character's id), so each character's wounds look
// different from everyone else's but stay the same every time the page is drawn.

/** How badly hurt: 0 healthy, 1 below half, 2 below a quarter, 3 at 0 HP. */
export function woundLevel(cur, max) {
  if (!(max > 0)) return 0;
  if (cur <= 0) return 3;
  if (cur < max / 4) return 2;
  if (cur < max / 2) return 1;
  return 0;
}

function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const W = 420, H = 210;
const f = (n) => n.toFixed(1);

/** One splatter: a main blob, satellite droplets thrown along a direction, and a few streaks. */
function splat(r, x, y, size, id) {
  const dir = r() * Math.PI * 2;
  let s = `<circle cx="${f(x)}" cy="${f(y)}" r="${f(size)}"/>`;
  for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) { // a slightly uneven edge on the main blob
    const a = r() * Math.PI * 2, d = size * (0.35 + r() * 0.3);
    s += `<circle cx="${f(x + Math.cos(a) * d)}" cy="${f(y + Math.sin(a) * d)}" r="${f(size * (0.45 + r() * 0.3))}"/>`;
  }
  for (let i = 0, n = 6 + Math.floor(r() * 12); i < n; i++) { // droplets thrown outward, stretched along their flight
    const a = dir + (r() - 0.5) * 1.6, d = size * (1.3 + r() * 3.2), rr = Math.max(0.6, size * (0.06 + r() * 0.2) * (1.4 - d / (size * 5)));
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
    s += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rr * (1.6 + r()))}" ry="${f(rr)}" transform="rotate(${f(a * 57.3)} ${f(cx)} ${f(cy)})"/>`;
  }
  for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) { // streaks
    const a = dir + (r() - 0.5) * 0.9, d0 = size * 0.8, d1 = size * (2.2 + r() * 2.5);
    s += `<path d="M${f(x + Math.cos(a) * d0)} ${f(y + Math.sin(a) * d0)} L${f(x + Math.cos(a) * d1)} ${f(y + Math.sin(a) * d1)}" stroke-width="${f(0.8 + r() * 1.8)}" stroke-linecap="round" fill="none" stroke="url(#bl-${id})"/>`;
  }
  return s;
}

/** A drip running down from the top edge (or from a splat). */
function drip(r, x, y0, len) {
  const w = 1.6 + r() * 2.4, y1 = y0 + len, wob = (r() - 0.5) * 3;
  return `<path d="M${f(x - w)} ${f(y0)} C${f(x - w * 0.6 + wob)} ${f(y0 + len * 0.5)} ${f(x - w * 0.5)} ${f(y1 - w)} ${f(x - w * 0.7)} ${f(y1)} A${f(w * 0.9)} ${f(w * 0.9)} 0 1 0 ${f(x + w * 0.7)} ${f(y1)} C${f(x + w * 0.5)} ${f(y1 - w)} ${f(x + w * 0.6 + wob)} ${f(y0 + len * 0.5)} ${f(x + w)} ${f(y0)} Z"/>`;
}

/** Claw marks: three or four parallel gouges that taper at both ends, kept clear of the text on the left. */
function claws(r, id) {
  const x = W * (0.6 + r() * 0.28), y = 45 + r() * (H - 90), ang = -65 + r() * 50, len = 70 + r() * 50;
  const rad = ang * Math.PI / 180, nx = -Math.sin(rad), ny = Math.cos(rad);
  let s = '';
  for (let i = 0, n = 3 + (r() < 0.4 ? 1 : 0); i < n; i++) {
    const off = (i - (n - 1) / 2) * (7 + r() * 2), l = len * (0.75 + r() * 0.3), bend = (r() - 0.5) * 14;
    const sx = x + nx * off - Math.cos(rad) * l / 2, sy = y + ny * off - Math.sin(rad) * l / 2;
    const ex = x + nx * off + Math.cos(rad) * l / 2, ey = y + ny * off + Math.sin(rad) * l / 2;
    const cx = (sx + ex) / 2 + nx * bend, cy = (sy + ey) / 2 + ny * bend;
    // Tapered gouge: out along one side of the curve, back along the other.
    const w = 1.6 + r() * 1.2, c1x = cx + nx * w, c1y = cy + ny * w, c2x = cx - nx * w, c2y = cy - ny * w;
    const gouge = `M${f(sx)} ${f(sy)} Q${f(c1x)} ${f(c1y)} ${f(ex)} ${f(ey)} Q${f(c2x)} ${f(c2y)} ${f(sx)} ${f(sy)} Z`;
    const lip = `M${f(sx)} ${f(sy)} Q${f(c1x + nx * 1.4)} ${f(c1y + ny * 1.4)} ${f(ex)} ${f(ey)}`;
    s += `<path d="${lip}" stroke="#f3e6d8" stroke-opacity=".28" stroke-width="1" fill="none" filter="url(#rough-${id})"/>`
      + `<path d="${gouge}" fill="#1c0202" opacity=".9" filter="url(#rough-${id})"/>`
      + `<path d="${gouge}" fill="#8a0a0a" opacity=".55" transform="translate(${f(-nx * 0.6)} ${f(-ny * 0.6)}) scale(1)"/>`;
  }
  return s;
}

/**
 * The two damage layers for a card: `under` sits behind the text (grime, stains, splatters, drips),
 * `over` sits on top (scratches, a little spatter, the bruised edge). Returns null when healthy.
 */
export function battleDamage(seed, level) {
  if (!level) return null;
  const r = rng(`${seed}|wounds`);
  const id = Math.floor(r() * 1e9).toString(36);
  const defs = `<defs>
    <radialGradient id="bl-${id}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#a40f0f"/><stop offset=".55" stop-color="#7a0707"/><stop offset="1" stop-color="#3e0202"/></radialGradient>
    <filter id="ragged-${id}" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="${Math.floor(r() * 99)}"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter>
    <filter id="rough-${id}"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="${Math.floor(r() * 99)}"/><feDisplacementMap in="SourceGraphic" scale="2.5"/></filter>
    <filter id="grime-${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="${Math.floor(r() * 99)}"/><feColorMatrix values="0 0 0 0 .08  0 0 0 0 .05  0 0 0 0 .03  0 0 0 -1.6 1.05"/></filter>
    <filter id="stain-${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .02" numOctaves="3" seed="${Math.floor(r() * 99)}"/><feColorMatrix values="0 0 0 0 .32  0 0 0 0 .02  0 0 0 0 .02  0 0 0 -11 ${level >= 3 ? 5.2 : 4.9}"/></filter>
  </defs>`;
  const svg = (cls, body) => `<svg class="${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${defs}${body}</svg>`;

  // Under the text: grime, dried stains, splatters and drips.
  let under = `<rect width="${W}" height="${H}" filter="url(#grime-${id})" opacity="${0.35 + level * 0.12}"/>`;
  if (level >= 2) under += `<rect width="${W}" height="${H}" filter="url(#stain-${id})" opacity=".5"/>`;
  let blood = '';
  const nSplats = [0, 2, 4, 6][level];
  for (let i = 0; i < nSplats; i++) {
    // Mostly towards the edges and the artwork on the right, where they read best.
    const edge = r() < 0.6, x = edge ? (r() < 0.65 ? W * (0.55 + r() * 0.45) : W * r() * 0.25) : W * r(), y = edge ? (r() < 0.5 ? H * r() * 0.3 : H * (0.7 + r() * 0.3)) : H * r();
    blood += splat(r, x, y, 6 + r() * (6 + level * 4), id);
  }
  for (let i = 0, n = [0, 2, 4, 6][level]; i < n; i++) blood += drip(r, 15 + r() * (W - 30), -2, 14 + r() * (25 + level * 22));
  under += `<g fill="url(#bl-${id})" filter="url(#ragged-${id})" opacity=".92">${blood}</g>`;

  // On top: claw marks, scuffs, a fine mist of spatter.
  let over = '';
  for (let i = 0, n = [0, 1, 2, 2][level]; i < n; i++) over += claws(r, id);
  for (let i = 0, n = 10 + level * 8; i < n; i++) { // scuffs
    const x = r() * W, y = r() * H, a = r() * Math.PI, l = 3 + r() * 14;
    over += `<path d="M${f(x)} ${f(y)} l${f(Math.cos(a) * l)} ${f(Math.sin(a) * l)}" stroke="#fff" stroke-opacity="${f(0.05 + r() * 0.12)}" stroke-width=".8"/>`;
  }
  let mist = '';
  for (let i = 0, n = 6 + level * 10; i < n; i++) mist += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(0.5 + r() * 1.6)}"/>`;
  over += `<g fill="#7d0808" opacity=".8">${mist}</g>`;

  return { under: svg('bd-under', under), over: svg('bd-over', over) };
}
