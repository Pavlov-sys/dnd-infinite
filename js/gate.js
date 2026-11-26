// Passkey screen shown before the app starts. This is a casual lock: the site's files are public on
// GitHub, so it keeps out people who only have the link, not someone who goes looking in the repo.
// To change the passkey run:  bun tools/set-passkey.mjs <new passkey>   (or node), then push.
import { h } from './ui/dom.js';
import { LOGO_SYMBOL, LOGO_WORDMARK } from './data/logo.js';

export const PASS_HASH = 'cbc0647aeaa6a4c1586453d33acb8ddd76e65ec9c7fc021d8b5ad090f009f13b';
const KEY = 'qw.unlocked';
const SALT = 'dnd-infinite|';

// Small synchronous SHA-256, so it also works on file:// and older browsers.
export function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const K = []; const H = [];
  let n = 2;
  const frac = (x) => ((x - Math.floor(x)) * 2 ** 32) >>> 0;
  for (let found = 0; found < 64; n++) {
    let prime = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (!prime) continue;
    if (found < 8) H[found] = frac(Math.sqrt(n));
    K[found++] = frac(Math.cbrt(n));
  }
  const len = bytes.length; const total = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total); m.set(bytes); m[len] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(total - 4, (len * 8) >>> 0); dv.setUint32(total - 8, Math.floor(len / 2 ** 29));
  const w = new Uint32Array(64); const r = (x, s) => (x >>> s) | (x << (32 - s));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3); const s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
  }
  return H.map((v) => v.toString(16).padStart(8, '0')).join('');
}
export const passHash = (pass) => sha256(SALT + String(pass).trim());

const read = (s) => { try { return s.getItem(KEY); } catch { return null; } };
export const isUnlocked = () => read(localStorage) === PASS_HASH || read(sessionStorage) === PASS_HASH;

/** Show the passkey screen; calls onUnlock once the right passkey is entered. */
export function showGate(root, onUnlock) {
  document.body.classList.add('locked');
  const input = h('input.gate-input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passkey', 'aria-label': 'Passkey', autofocus: true });
  const remember = h('input', { type: 'checkbox', checked: true });
  const msg = h('p.gate-msg', { role: 'alert' });
  const card = h('form.gate-card', { onsubmit: (e) => {
    e.preventDefault();
    if (passHash(input.value) === PASS_HASH) {
      try { (remember.checked ? localStorage : sessionStorage).setItem(KEY, PASS_HASH); } catch { /* private mode: unlock for this visit only */ }
      document.body.classList.remove('locked');
      onUnlock();
    } else {
      msg.textContent = 'That passkey isn’t right.';
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      input.select();
    }
  } },
    h('img.gate-symbol', { src: LOGO_SYMBOL, alt: '' }),
    h('h1', {}, h('img.gate-word', { src: LOGO_WORDMARK, alt: 'Infinity Codex' })),
    h('p.gate-sub', {}, 'This site is invite-only. Enter the passkey you were given.'),
    input,
    h('button.btn.primary.gate-go', { type: 'submit' }, 'Enter'),
    h('label.gate-remember', {}, remember, ' Remember this device'),
    msg);
  // Legal notice: unofficial fan project, trademark disclaimer and the licences the bundled content is used under.
  const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  const legal = h('details.gate-legal', {},
    h('summary', {}, 'Legal notice'),
    h('p', {}, h('strong', {}, 'Unofficial fan content. '), 'Infinity Codex is a free, non-commercial, open-source project. It is not affiliated with, endorsed, sponsored or approved by Wizards of the Coast LLC or Hasbro, Inc.'),
    h('p', {}, 'Dungeons & Dragons, D&D and D&D Beyond are trademarks of Wizards of the Coast LLC. They are used here only to describe what this tool is compatible with; no logos, artwork or trade dress of Wizards of the Coast are used.'),
    h('p', {}, 'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at ', a('https://www.dndbeyond.com/srd', 'dndbeyond.com/srd'), '. The SRD 5.2 is licensed under the ', a('https://creativecommons.org/licenses/by/4.0/legalcode', 'Creative Commons Attribution 4.0 International License'), '.'),
    h('p', {}, 'Optional content packs are used under CC-BY-4.0 or the Open Game License 1.0a, credited to their publishers in the Compendium Library and in the project\u2019s ATTRIBUTION file. No content from non-open books (such as the Player\u2019s Handbook) is included, and none may be added to the shared packs.'),
    h('p', {}, 'Anything users create or import stays in their own browser. Rights holders can raise concerns through the project\u2019s ', a('https://github.com/Pavlov-sys/dnd-infinite/issues', 'GitHub issues'), '.'));
  root.replaceChildren(h('div.gate', {}, card, legal));
  setTimeout(() => input.focus(), 50);
}

/** Forget the unlock on this device (used by the Lock button). */
export function lock() {
  try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  location.reload();
}
