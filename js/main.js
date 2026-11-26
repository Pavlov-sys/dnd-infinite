// App shell and hash router. Routes: #home, #build-<id>-<step>, #sheet-<id>, #compendium, #homebrew, #campaigns
import { h } from './ui/dom.js';
import { renderHome } from './ui/home.js';
import { renderBuilder } from './ui/builder.js';
import { renderSheet } from './ui/sheet.js';
import { clearPageBackground } from './ui/sheet-style.js';
import { renderCompendium } from './ui/compendium.js';
import { renderHomebrew } from './ui/homebrew.js';
import { renderTray } from './ui/dicelog.js';
import { getCharacter, markUsed } from './engine/store.js';
import { rebuild } from './data/index.js';
import { isUnlocked, showGate, lock } from './gate.js';
import { LOGO_SYMBOL, LOGO_ICON, LOGO_TOUCH } from './data/logo.js';
import { LANDING_BG, CARD_ART } from './data/landing.js';
import { icon } from './ui/icons.js';
import { startSmoke, stopSmoke } from './ui/smoke.js';

document.documentElement.style.setProperty('--landing-bg', `url(${LANDING_BG})`);
document.documentElement.style.setProperty('--card-art', `url(${CARD_ART})`);
document.querySelector('.foot-social')?.append(icon('github'));

// The logo is embedded, so the top bar and tab icon also work in the single-file build.
document.querySelector('.brand-symbol')?.setAttribute('src', LOGO_SYMBOL);
for (const [rel, href] of [['icon', LOGO_ICON], ['apple-touch-icon', LOGO_TOUCH]]) {
  let l = document.querySelector(`link[rel="${rel}"]`); if (!l) { l = document.createElement('link'); l.rel = rel; document.head.append(l); }
  l.type = 'image/png'; l.href = href;
}

const root = document.getElementById('app');
const go = (hash) => { if (location.hash.slice(1) === hash) route(); else location.hash = hash; };

const NAV = [['home', 'Characters'], ['compendium', 'Compendium'], ['homebrew', 'Homebrew'], ['campaigns', 'Campaigns']];

let lastSection = null;
function route() {
  clearPageBackground();
  const hash = location.hash.slice(1) || 'home';
  const section = hash.startsWith('build') || hash.startsWith('sheet') ? 'home' : hash.startsWith('homebrew') ? 'homebrew' : hash;
  const sectionKey = section.split('-')[0];
  const isHome = sectionKey === 'home' && !hash.startsWith('build') && !hash.startsWith('sheet');
  document.body.classList.toggle('page-home', isHome);
  if (isHome) startSmoke(); else stopSmoke();
  const entering = sectionKey !== lastSection; lastSection = sectionKey;
  document.querySelectorAll('.topnav a').forEach((a) => a.classList.toggle('on', a.dataset.route === sectionKey));
  moveInk();
  rebuild();
  let m;
  if ((m = hash.match(/^build-([a-z0-9]+)-([a-z]+)$/))) {
    const c = getCharacter(m[1]);
    if (c) markUsed(c.id);
    return c ? renderBuilder(root, c, m[2], go) : notFound();
  }
  if ((m = hash.match(/^sheet-([a-z0-9]+)$/))) {
    const c = getCharacter(m[1]);
    if (c) markUsed(c.id);
    return c ? renderSheet(root, c, go) : notFound();
  }
  if (hash === 'compendium' || hash.startsWith('compendium-')) return renderCompendium(root, hash.startsWith('compendium-') ? hash.slice(11) : (entering ? 'library' : undefined));
  if (hash === 'homebrew' || hash.startsWith('homebrew-')) return renderHomebrew(root, hash.startsWith('homebrew-') ? hash.slice(9) : null, go);
  if (hash === 'campaigns') return root.replaceChildren(h('div.empty', {}, h('div.empty-art', {}, '🗺'), h('h2', {}, 'Campaigns are coming'),
    h('p', {}, 'Create a campaign, invite your party, and let the DM see everyone\'s sheets. This needs the sync server on the roadmap; characters you build now will carry over.')));
  return renderHome(root, go);
}
// ---------------------------------------------------------------- page transitions
// Moving between sections slides the page left or right (in menu order); opening something inside a
// section (a sheet, an editor, a pack) slides forward, and going back slides the other way.
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function rank(hash) {
  const h0 = hash || 'home';
  const sec = h0.startsWith('build') || h0.startsWith('sheet') ? 'home' : h0.split('-')[0];
  const nav = Math.max(0, NAV.findIndex(([id]) => id === sec));
  const depth = h0.startsWith('build') ? 2 : h0.startsWith('sheet') ? 1 : /^(homebrew|compendium)-/.test(h0) ? 1 : 0;
  return { nav, depth, sec, build: h0.startsWith('build') };
}
function slideTo(oldHash, newHash) {
  const a = rank(oldHash); const b = rank(newHash);
  const dir = Math.sign(b.nav - a.nav) || Math.sign(b.depth - a.depth);
  // Moving between builder steps or within a page re-renders in place: no slide.
  if (!dir || reduceMotion() || !root.animate) { route(); return; }
  const rect = root.getBoundingClientRect();
  const old = [...root.childNodes];
  // Opening a character sheet raises it from below like a card being drawn; leaving it lowers it again.
  const toSheet = /^sheet-/.test(newHash || '') && !/^sheet-/.test(oldHash || '');
  const fromSheet = /^sheet-/.test(oldHash || '') && !/^sheet-/.test(newHash || '');
  const ghost = document.createElement('div');
  // Keep the outgoing page looking exactly as it did: its styles depend on page classes on <body>
  // (like the dark landing look) and on <main>'s padding, which the new page is about to change.
  const cs = getComputedStyle(root);
  ghost.className = ['page-ghost', ...document.body.classList].join(' ');
  Object.assign(ghost.style, { padding: cs.padding, boxSizing: 'border-box', color: cs.color, font: cs.font });
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${Math.max(0, innerHeight - rect.top)}px` });
  route();
  ghost.append(...old);
  document.body.append(ghost);
  const dist = Math.min(120, innerWidth * 0.12) * dir;
  const ease = 'cubic-bezier(.2,.8,.2,1)';
  if (toSheet) {
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 380, easing: ease, fill: 'forwards' }).onfinish = () => ghost.remove();
    // The sheet rises over the old page, so it sits above the fading copy while it moves.
    Object.assign(root.style, { position: 'relative', zIndex: '6' });
    root.animate([{ transform: `translateY(${Math.round(innerHeight * 0.6)}px)`, opacity: 0.2 }, { opacity: 1, offset: 0.45 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.16,1,.3,1)' })
      .onfinish = () => { root.style.position = ''; root.style.zIndex = ''; };
    return;
  }
  if (fromSheet) {
    ghost.style.zIndex = '6';
    ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${Math.round(innerHeight * 0.6)}px)`, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = () => ghost.remove();
    root.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: ease });
    return;
  }
  ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dist}px)`, opacity: 0 }], { duration: 260, easing: ease, fill: 'forwards' }).onfinish = () => ghost.remove();
  root.animate([{ transform: `translateX(${dist}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: ease });
}
// The red highlight behind the current menu item glides to the new one.
function moveInk(instant = false) {
  const nav = document.querySelector('.topnav'); if (!nav) return;
  let ink = nav.querySelector('.nav-ink');
  if (!ink) { ink = document.createElement('span'); ink.className = 'nav-ink'; ink.setAttribute('aria-hidden', 'true'); nav.prepend(ink); instant = true; }
  const on = nav.querySelector('a.on');
  if (!on) { ink.style.opacity = '0'; return; }
  if (instant) ink.style.transition = 'none';
  Object.assign(ink.style, { opacity: '1', width: `${on.offsetWidth}px`, height: `${on.offsetHeight}px`, transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)` });
  if (instant) { void ink.offsetWidth; ink.style.transition = ''; }
}
window.addEventListener('resize', () => moveInk(true));

const notFound = () => root.replaceChildren(h('div.empty', {}, h('h2', {}, 'Character not found'), h('p', {}, 'It may have been deleted, or was saved in a different browser.'), h('a.btn.primary', { href: '#home' }, 'Back to My Characters')));

function start() {
  const NAV_ICON = { home: 'user', compendium: 'book', homebrew: 'home', campaigns: 'd20' };
  document.querySelector('.topnav').replaceChildren(...NAV.map(([id, label]) => h('a', { href: `#${id}`, 'data-route': id }, icon(NAV_ICON[id]), h('span', {}, label))),
    h('button.lock-btn', { title: 'Lock Infinity Codex on this device (asks for the passkey again)', 'aria-label': 'Lock', onclick: lock }, icon('lock')));
  let lastHash = location.hash.slice(1);
  window.addEventListener('hashchange', () => { const next = location.hash.slice(1); slideTo(lastHash, next); lastHash = next; window.scrollTo(0, 0); });
  // Re-render the current view if homebrew changes in another tab.
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('qw.') && e.key !== 'qw.unlocked') route(); });
  route();
  moveInk(true);
  document.fonts?.ready.then(() => moveInk(true));
  renderTray();
}
if (isUnlocked()) start(); else showGate(root, start);
