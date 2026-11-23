// Tiny DOM helpers — no framework, so contributors only need plain JavaScript.
export function h(tag, attrs = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export function modal(title, body, actions = [], { onClose } = {}) {
  let closed = false;
  const close = () => { if (closed) return; closed = true; wrap.remove(); onClose?.(); };
  const wrap = h('div.modal-backdrop', { onclick: (e) => { if (e.target === wrap) close(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true' },
      h('div.modal-head', {}, h('h3', {}, title), h('button.icon-btn', { onclick: close, 'aria-label': 'Close' }, '✕')),
      h('div.modal-body', {}, body),
      actions.length ? h('div.modal-actions', {}, actions.map((a) => h(`button.btn${a.primary ? '.primary' : ''}${a.danger ? '.danger' : ''}`, { onclick: () => { if (a.onClick?.() !== false) close(); } }, a.label))) : null));
  document.body.append(wrap);
  return close;
}

export function confirmDialog(title, text, onYes, label = 'Delete') {
  modal(title, h('p', {}, text), [{ label: 'Cancel' }, { label, danger: true, onClick: onYes }]);
}

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); return true; } catch { toast('Copy failed — select the text and copy manually'); return false; }
}

export function downloadText(filename, text) {
  try {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
    document.body.append(a); a.click(); a.remove();
  } catch { toast('Download blocked here — use Copy instead'); }
}

/** Collapsible "Explain" block used throughout the builder. */
export function explain(summary, ...body) {
  return h('details.explain', {}, h('summary', {}, '❔ ', summary), h('div', {}, ...body));
}

/** Character portrait: uploaded image, or the first letter of the name. */
export function portraitEl(c, cls = 'portrait') {
  const sel = cls.split(' ').map((x) => `.${x}`).join('');
  return c.portrait ? h(`div${sel}.has-img`, {}, h('img', { src: c.portrait, alt: '' })) : h(`div${sel}`, {}, (c.name || '?')[0].toUpperCase());
}

/** Render SRD-style rules text: paragraphs, **bold** run-ins, "Name." run-in headings, bullet lines and simple pipe tables. */
export function rich(text, cls = 'rich') {
  if (!text) return null;
  const inline = (line) => {
    const out = []; const re = /\*\*(.+?)\*\*/g; let last = 0; let m;
    while ((m = re.exec(line))) { out.push(line.slice(last, m.index), h('b', {}, m[1])); last = re.lastIndex; }
    out.push(line.slice(last));
    if (out.length === 1) { const run = line.match(/^([A-Z][\w'’ ,/()-]{1,40}?\.)\s(.+)/); if (run && run[1].split(' ').length <= 6) return [h('b', {}, run[1]), ' ', run[2]]; }
    return out;
  };
  const blocks = []; let list = null; let table = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) { list = table = null; continue; }
    if (/^[-•]\s/.test(line)) { if (!list) blocks.push(list = h('ul.compact')); list.append(h('li', {}, inline(line.replace(/^[-•]\s/, '')))); continue; }
    if (line.includes(' | ')) { if (!table) blocks.push(table = h('table.rules-table')); table.append(h('tr', {}, line.split('|').map((c) => h(table.children.length ? 'td' : 'th', {}, c.trim())))); continue; }
    list = table = null; blocks.push(h('p', {}, inline(line)));
  }
  return h(`div.${cls}`, {}, blocks);
}
