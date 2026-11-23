// App shell and hash router. Routes: #home, #build-<id>-<step>, #sheet-<id>, #compendium, #homebrew, #campaigns
import { h } from './ui/dom.js';
import { renderHome } from './ui/home.js';
import { renderBuilder } from './ui/builder.js';
import { renderSheet } from './ui/sheet.js';
import { clearPageBackground } from './ui/sheet-style.js';
import { renderCompendium } from './ui/compendium.js';
import { renderHomebrew } from './ui/homebrew.js';
import { renderTray } from './ui/dicelog.js';
import { getCharacter } from './engine/store.js';
import { rebuild } from './data/index.js';

const root = document.getElementById('app');
const go = (hash) => { if (location.hash.slice(1) === hash) route(); else location.hash = hash; };

const NAV = [['home', 'Characters'], ['compendium', 'Compendium'], ['homebrew', 'Homebrew'], ['campaigns', 'Campaigns']];

function route() {
  clearPageBackground();
  const hash = location.hash.slice(1) || 'home';
  const section = hash.startsWith('build') || hash.startsWith('sheet') ? 'home' : hash.startsWith('homebrew') ? 'homebrew' : hash;
  document.querySelectorAll('.topnav a').forEach((a) => a.classList.toggle('on', a.dataset.route === section));
  rebuild();
  let m;
  if ((m = hash.match(/^build-([a-z0-9]+)-([a-z]+)$/))) {
    const c = getCharacter(m[1]);
    return c ? renderBuilder(root, c, m[2], go) : notFound();
  }
  if ((m = hash.match(/^sheet-([a-z0-9]+)$/))) {
    const c = getCharacter(m[1]);
    return c ? renderSheet(root, c, go) : notFound();
  }
  if (hash === 'compendium') return renderCompendium(root);
  if (hash === 'homebrew' || hash.startsWith('homebrew-')) return renderHomebrew(root, hash.startsWith('homebrew-') ? hash.slice(9) : null, go);
  if (hash === 'campaigns') return root.replaceChildren(h('div.empty', {}, h('div.empty-art', {}, '🗺'), h('h2', {}, 'Campaigns are coming'),
    h('p', {}, 'Create a campaign, invite your party, and let the DM see everyone\'s sheets. This needs the sync server on the roadmap; characters you build now will carry over.')));
  return renderHome(root, go);
}
const notFound = () => root.replaceChildren(h('div.empty', {}, h('h2', {}, 'Character not found'), h('p', {}, 'It may have been deleted, or was saved in a different browser.'), h('a.btn.primary', { href: '#home' }, 'Back to My Characters')));

document.querySelector('.topnav').replaceChildren(...NAV.map(([id, label]) => h('a', { href: `#${id}`, 'data-route': id }, label)));
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
// Re-render the current view if homebrew changes in another tab.
window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('qw.')) route(); });
route();
renderTray();
