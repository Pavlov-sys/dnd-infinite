// Floating dice tray: roll log, advantage toggle and a custom roll box.
import { h } from './dom.js';
import { roll, describe } from '../engine/dice.js';
import { animateRoll, dicePrefs, setDicePref } from './dice-anim.js';

const log = [];
let mode = 0; // -1 disadvantage, 0 normal, 1 advantage
let tray;
let closeTimer;

export function rollDice(label, expr, { d20 = false, adv = 0 } = {}) {
  // adv: +1 / -1 from the sheet's own advantage/disadvantage; the tray's one-off toggle combines with it.
  const net = d20 ? Math.sign((mode || 0) + (adv || 0)) : 0;
  const r = roll(expr, { advantage: net });
  const entry = { label, r, mode: net, t: Date.now() };
  if (d20 && mode) setMode(0); // advantage applies to one roll
  // Show the result in the log once the dice have landed (immediately if animation is off).
  animateRoll(r).then(() => {
    log.unshift(entry);
    log.length = Math.min(log.length, 30);
    renderTray(true);
  });
  return r;
}

function setMode(m) { mode = m; renderTray(); }

export function renderTray(open) {
  if (!tray) {
    tray = h('aside.dice-tray');
    document.body.append(tray);
    document.addEventListener('pointerdown', (e) => { if (!tray.contains(e.target) && !e.target.closest('.roll-btn, .ability, .line, button.stat-box')) tray.classList.remove('open'); });
  }
  if (open) {
    tray.classList.add('open');
    // Auto-collapse after a roll so the tray never blocks the page; hovering keeps it open.
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!tray.matches(':hover, :focus-within')) tray.classList.remove('open'); }, 4000);
  }
  const last = log[0];
  tray.replaceChildren(
    h('button.tray-toggle', { onclick: () => tray.classList.toggle('open'), 'aria-label': 'Dice tray' }, '🎲', last ? h('span.tray-last', {}, last.r.total) : null),
    h('div.tray-panel', {},
      h('div.tray-head', {}, h('strong', {}, 'Dice'),
        h('div.tray-prefs', {},
          h(`button.icon-btn${dicePrefs().animate ? '.on' : ''}`, { title: 'Animated dice', onclick: () => { setDicePref('animate', !dicePrefs().animate); renderTray(); } }, '🎲'),
          h(`button.icon-btn${dicePrefs().sound ? '.on' : ''}`, { title: 'Dice sounds', onclick: () => { setDicePref('sound', !dicePrefs().sound); renderTray(); } }, dicePrefs().sound ? '🔊' : '🔇')),
        h('div.seg.small', {}, [[-1, 'Dis'], [0, 'Normal'], [1, 'Adv']].map(([m, l]) => h(`button${mode === m ? '.on' : ''}`, { onclick: () => setMode(m) }, l)))),
      h('form.tray-custom', { onsubmit: (e) => { e.preventDefault(); const v = e.target.expr.value.trim(); if (v) rollDice('Custom', v, { d20: /^1?d20/.test(v) }); } },
        h('input', { name: 'expr', placeholder: 'e.g. 2d6+3', autocomplete: 'off' }), h('button.btn.small', { type: 'submit' }, 'Roll')),
      h('div.tray-quick', {}, ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((d) => h('button.chip', { onclick: () => rollDice(d, `1${d}`, { d20: d === 'd20' }) }, d))),
      h('ol.tray-log', {}, log.map((e, i) => h(`li${i === 0 ? '.latest' : ''}${e.r.crit ? '.crit' : ''}${e.r.fumble ? '.fumble' : ''}`, {},
        h('div.tl-top', {}, h('span', {}, e.label, e.mode ? h('em', {}, e.mode > 0 ? ' (adv)' : ' (dis)') : null), h('b', {}, e.r.total)),
        h('div.tl-detail', {}, `${e.r.expr}: ${describe(e.r)}${e.r.crit ? ' — CRIT!' : ''}${e.r.fumble ? ' — natural 1' : ''}`))))));
}
