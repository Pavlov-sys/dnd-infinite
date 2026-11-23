// Animated dice: polyhedral dice tumble across the screen, bounce off the edges and settle on the
// rolled values. Pure canvas 2D, no libraries. Results always come from engine/dice.js — the animation
// only shows them. Respects prefers-reduced-motion and the tray's Animate / Sound toggles.

const PREF_KEY = 'qw.dice.v1';
export function dicePrefs() {
  try { return { animate: true, sound: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { animate: true, sound: true }; }
}
export function setDicePref(key, value) {
  const p = { ...dicePrefs(), [key]: value };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let current = null; // the running animation (a new roll replaces it)

// ---------------------------------------------------------------- sound (synthesized, no files)
let audio = null;
function clack(intensity = 1) {
  if (!dicePrefs().sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const len = 0.05;
    const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    const src = audio.createBufferSource(); src.buffer = buf;
    const band = audio.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1800 + Math.random() * 1600; band.Q.value = 1.4;
    const gain = audio.createGain(); gain.gain.setValueAtTime(Math.min(0.35, 0.12 + 0.25 * intensity), t);
    src.connect(band).connect(gain).connect(audio.destination);
    src.start(t);
  } catch { /* audio unavailable */ }
}

// ---------------------------------------------------------------- die shapes
const SHAPES = { 4: 3, 6: 4, 8: 4, 10: 4, 12: 5, 20: 6, 100: 4 };
function outline(sides, r) {
  const n = SHAPES[sides] || 6;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + (sides === 6 ? Math.PI / 4 : 0);
    const rr = sides === 10 || sides === 100 ? r * (i % 2 ? 0.78 : 1.08) : sides === 8 ? r * 1.05 : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}

function drawDie(ctx, d, theme) {
  const r = d.size / 2;
  const pts = outline(d.sides, r);
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.ang);
  ctx.globalAlpha = d.dropped ? 0.45 : 1;
  // shadow
  ctx.save(); ctx.translate(4, 7); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.filter = 'blur(3px)'; ctx.fill(); ctx.restore();
  // body
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.2);
  g.addColorStop(0, theme.light); g.addColorStop(0.55, theme.mid); g.addColorStop(1, theme.dark);
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = theme.edge; ctx.stroke();
  // facet lines for a 3D look
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.2; ctx.beginPath();
  if (d.sides === 20) { const inner = outline(20, r * 0.58).filter((_, i) => i % 2 === 0); inner.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); inner.forEach(([x, y], i) => { ctx.moveTo(x, y); ctx.lineTo(...pts[i * 2]); ctx.moveTo(x, y); ctx.lineTo(...pts[(i * 2 + 1) % 6]); }); }
  else if (d.sides === 12) { const inner = outline(12, r * 0.55); inner.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); inner.forEach(([x, y], i) => { ctx.moveTo(x, y); ctx.lineTo(...pts[i]); }); }
  else if (d.sides === 8) { ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[3][0], pts[3][1]); }
  else if (d.sides === 6) { const k = 0.72; const inner = pts.map(([x, y]) => [x * k, y * k]); inner.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); inner.forEach(([x, y], i) => { ctx.moveTo(x, y); ctx.lineTo(...pts[i]); }); }
  else if (d.sides === 10 || d.sides === 100) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(0, r * 0.25); ctx.lineTo(pts[2][0], pts[2][1]); ctx.moveTo(0, r * 0.25); ctx.lineTo(pts[1][0], pts[1][1]); ctx.moveTo(0, r * 0.25); ctx.lineTo(pts[3][0], pts[3][1]); }
  else if (d.sides === 4) { ctx.moveTo(0, 0); pts.forEach(([x, y]) => { ctx.moveTo(0, 0); ctx.lineTo(x, y); }); }
  ctx.stroke();
  // number (kept upright-ish so it stays readable as the die slows)
  ctx.rotate(-d.ang * (d.settled ? 1 : 0.15));
  const label = String(d.face);
  ctx.font = `800 ${Math.round(r * (label.length > 2 ? 0.62 : label.length > 1 ? 0.78 : 0.95))}px "Source Sans 3", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(label, 0, d.sides === 4 ? r * 0.12 : 2);
  ctx.fillStyle = d.crit ? '#ffe17a' : '#fff'; ctx.fillText(label, 0, d.sides === 4 ? r * 0.12 : 2);
  if (d.settled && d.crit) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 120); ctx.lineWidth = 3; ctx.strokeStyle = '#ffd34d'; ctx.rotate(d.ang); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * 1.12, y * 1.12) : ctx.moveTo(x * 1.12, y * 1.12))); ctx.closePath(); ctx.stroke(); }
  ctx.restore();
}

const THEMES = {
  red: { light: '#ef6a5c', mid: '#c53131', dark: '#7d1414', edge: '#5e0e0e' },
  fumble: { light: '#6b6f76', mid: '#3b3e44', dark: '#1d1f22', edge: '#000' },
};

/**
 * Animate a roll from engine/dice.js. Resolves when the dice have settled.
 * Resolves immediately (no animation) when animation is off or motion is reduced.
 */
export function animateRoll(result) {
  if (!dicePrefs().animate || reducedMotion() || typeof document === 'undefined') return Promise.resolve();
  current?.cancel();
  const dice = [];
  for (const p of result.parts || []) {
    if (!p.sides) continue;
    p.rolls.forEach((v, i) => dice.push({ sides: p.sides, value: v, dropped: !p.keptIdx.includes(i) }));
  }
  if (!dice.length) return Promise.resolve();
  const shown = dice.slice(0, 14);

  const canvas = document.createElement('canvas');
  canvas.className = 'dice-canvas';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0; let H = 0;
  const resize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  resize();
  const size = Math.max(46, Math.min(78, W / 11));
  const bodies = shown.map((d, i) => ({
    ...d, size: d.sides === 20 ? size * 1.08 : size,
    x: W + size * (0.6 + i * 0.35), y: H * (0.45 + Math.random() * 0.3),
    vx: -(W * (0.95 + Math.random() * 0.55)), vy: -(H * (0.15 + Math.random() * 0.5)) * (Math.random() < 0.5 ? 1 : -0.6),
    ang: Math.random() * Math.PI * 2, va: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 10),
    face: 1 + Math.floor(Math.random() * d.sides), nextFace: 0, settled: false,
    crit: d.sides === 20 && d.value === 20 && !d.dropped, fumble: d.sides === 20 && d.value === 1 && !d.dropped,
  }));

  let cancelled = false; let raf = 0; let last = performance.now(); const start = last;
  let settledAt = 0; let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const cleanup = () => { cancelAnimationFrame(raf); canvas.remove(); window.removeEventListener('resize', resize); if (current === handle) current = null; resolveDone(); };
  const handle = { cancel: () => { cancelled = true; cleanup(); } };
  current = handle;
  clack(1);

  const step = (now) => {
    if (cancelled) return;
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    const t = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    let allSettled = true;
    for (const b of bodies) {
      if (!b.settled) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.ang += b.va * dt;
        const drag = Math.exp(-(t < 0.5 ? 0.6 : 1.7) * dt);
        b.vx *= drag; b.vy *= drag; b.va *= Math.exp(-1.6 * dt);
        const r = b.size / 2; const m = 8;
        if (t > 0.15) {
          if (b.x < r + m && b.vx < 0) { b.x = r + m; b.vx = -b.vx * 0.62; b.va *= -0.8; clack(Math.abs(b.vx) / W); }
          if (b.x > W - r - m && b.vx > 0) { b.x = W - r - m; b.vx = -b.vx * 0.62; b.va *= -0.8; clack(Math.abs(b.vx) / W); }
        }
        if (b.y < r + 70 && b.vy < 0) { b.y = r + 70; b.vy = -b.vy * 0.62; clack(Math.abs(b.vy) / H); }
        if (b.y > H - r - m && b.vy > 0) { b.y = H - r - m; b.vy = -b.vy * 0.62; clack(Math.abs(b.vy) / H); }
        // simple die-to-die separation
        for (const o of bodies) if (o !== b) {
          const dx = b.x - o.x; const dy = b.y - o.y; const dist = Math.hypot(dx, dy) || 1; const min = (b.size + o.size) / 2 * 0.92;
          if (dist < min) { const push = (min - dist) / 2; b.x += (dx / dist) * push; b.y += (dy / dist) * push; }
        }
        const speed = Math.hypot(b.vx, b.vy);
        if (speed > 60 && now > b.nextFace) { b.face = 1 + Math.floor(Math.random() * b.sides); b.nextFace = now + 40 + 3000 / speed; }
        if ((speed < 24 && Math.abs(b.va) < 1 && t > 1.1) || t > 2.8) {
          b.settled = true; b.face = b.sides === 100 ? b.value : b.value; b.vx = b.vy = 0;
          b.ang = Math.round(b.ang / (Math.PI / 2)) * (Math.PI / 2); // land squarely
          clack(0.3);
        } else if (speed < 110 && t > 0.8) {
          b.face = b.value; // the true face shows as it slows down
        }
      }
      if (!b.settled) allSettled = false;
      drawDie(ctx, b, b.fumble ? THEMES.fumble : THEMES.red);
    }
    if (allSettled && !settledAt) { settledAt = now; resolveDone(); }
    if (settledAt) {
      // total bubble, then fade everything out
      const since = (now - settledAt) / 1000;
      const cx = bodies.reduce((a, b) => a + b.x, 0) / bodies.length;
      const cy = Math.max(110, Math.min(...bodies.map((b) => b.y)) - size * 0.95);
      const label = `${result.total}${dice.length > shown.length ? ' *' : ''}`;
      ctx.save();
      ctx.globalAlpha = Math.min(1, since * 4);
      ctx.font = '800 30px "Cinzel", Georgia, serif';
      const w = Math.max(64, ctx.measureText(label).width + 34);
      ctx.fillStyle = 'rgba(30,31,34,.92)'; ctx.strokeStyle = '#e40712'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - 24, w, 48, 24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, cy + 1);
      ctx.restore();
      canvas.style.opacity = String(Math.max(0, 1 - Math.max(0, since - 1.8) / 0.5));
      if (since > 2.35) return cleanup();
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  window.addEventListener('resize', resize);
  return done;
}
