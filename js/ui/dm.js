// DM Assistant: a placeholder for the tools a Dungeon Master will get. Until then it holds an
// easter egg: every so often the screen flickers and Egyptian hieroglyphs surface and fade.
import { h } from './dom.js';
import { icon } from './icons.js';
import { HIEROGLYPH_FONT } from '../data/hieroglyph-font.js';

const PLANNED = [
  ['Party view', 'Everyone’s sheets at a glance: HP, AC, passive Perception, conditions and concentration.'],
  ['Initiative tracker', 'Turn order for the party and monsters, with rounds and spell durations ticking down.'],
  ['Encounter builder', 'Build fights from the monster compendium, balanced for the party’s levels.'],
  ['Handouts and loot', 'Share notes, maps and treasure with the players.'],
];

// Recognisable signs: the Eye of Horus, ankh, scarab, falcon, cobra, owl, djed pillar, sun disc…
const GLYPHS = ['𓂀', '𓋹', '𓆣', '𓅃', '𓆙', '𓅓', '𓊽', '𓇳', '𓁹', '𓃭', '𓄿', '𓆓', '𓈖', '𓇋', '𓂋', '𓀀', '𓁶', '𓌳', '𓊪', '𓎛', '𓃀', '𓏏', '𓋴', '𓍯'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const between = (lo, hi) => lo + Math.random() * (hi - lo);

let fontAdded = false;
function hieroglyphFont() {
  // A 14 KB subset of Noto Sans Egyptian Hieroglyphs (OFL), so the signs show on every device, offline too.
  if (fontAdded) return; fontAdded = true;
  document.head.append(h('style', {}, `@font-face { font-family: 'IC Hieroglyphs'; src: url(${HIEROGLYPH_FONT}) format('woff2'); font-display: block; }`));
}

export function renderDM(root) {
  hieroglyphFont();
  const glyphLayer = h('div.dm-glyphs', { 'aria-hidden': 'true' });
  const title = h('h1', {}, 'DM Assistant');
  const page = h('div.dm-page', {},
    glyphLayer,
    h('div.dm-inner', {},
      h('div.dm-mark', {}, icon('screen')),
      title,
      h('p.dm-lead', {}, 'Tools for running the game are being prepared behind the screen.'),
      h('div.dm-planned', {}, PLANNED.map(([t, d]) => h('div.dm-card', {}, h('b', {}, t), h('span', {}, d)))),
      h('p.muted.tiny', {}, 'Sharing sheets with a DM needs the sync server on the roadmap. Characters you build now will carry over.')));
  root.replaceChildren(page);
  haunt(page, glyphLayer, title);
}

/** Every 10–35 seconds, sometimes, the page flickers and a few hieroglyphs surface, then fade away. */
function haunt(page, layer, title) {
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let timer = null;
  const schedule = (first) => { timer = setTimeout(tick, first ? between(4000, 9000) : between(10000, 35000)); };
  const tick = () => {
    if (!page.isConnected) return; // left the page: stop
    if (document.hidden || Math.random() < 0.35) return schedule();
    // Flicker (never a strobe: a couple of dips in brightness under half a second; skipped for reduced motion).
    if (!calm) { page.classList.remove('dm-flicker'); void page.offsetWidth; page.classList.add('dm-flicker'); }
    const n = Math.round(between(5, 13));
    const { width, height } = layer.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const g = h('span.dm-glyph', { style: {
        left: `${between(4, 92)}%`, top: `${between(6, 88)}%`, fontSize: `${Math.round(between(28, Math.min(110, Math.max(40, height / 5))))}px`,
        animationDelay: `${Math.round(between(0, 380))}ms`, animationDuration: `${Math.round(between(900, 1900))}ms`, transform: `rotate(${between(-8, 8).toFixed(1)}deg)`,
      } }, pick(GLYPHS));
      layer.append(g);
      g.addEventListener('animationend', () => g.remove());
    }
    // Now and then the title itself turns to glyphs for a moment.
    if (Math.random() < 0.4) {
      const text = 'DM Assistant';
      title.textContent = Array.from(text, (ch) => (ch === ' ' ? ' ' : pick(GLYPHS))).join('');
      title.classList.add('dm-glyph-title');
      setTimeout(() => { title.textContent = text; title.classList.remove('dm-glyph-title'); }, calm ? 900 : 450);
    }
    void width;
    schedule();
  };
  schedule(true);
}
