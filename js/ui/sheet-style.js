// Sheet customization: light/dark mode, accent colour, panel opacity, frame style, text size and
// backgrounds (built-in presets or an uploaded image). Settings live on the character (c.appearance);
// uploaded images are stored in IndexedDB (falling back to localStorage), referenced by id.
import { tintOf } from './class-tint.js';
import { getClass } from '../data/index.js';
import { h, modal, toast } from './dom.js';

export const RECOMMENDED = { width: 2560, height: 1440, min: { width: 1920, height: 1080 } };
const MAX_EDGE = 2560; // uploads are scaled down to this so they stay small in storage

export const APPEARANCE_DEFAULT = {
  mode: 'dark', accent: '#c53131', panelOpacity: 92, frame: 'ornate', frameColor: 'class', textSize: 'normal', fullPage: true,
  background: { kind: 'preset', preset: 'frost', imageId: null, dim: 30, blur: 0, focus: 'center', imageInfo: null },
};

export const ACCENTS = [
  ['#c53131', 'Beyond Red'], ['#1b9af0', 'Arcane Blue'], ['#2fa36b', 'Emerald'], ['#9b59d0', 'Amethyst'],
  ['#d4a017', 'Gold'], ['#e2672b', 'Ember'], ['#d94f8a', 'Rose'], ['#6c7a89', 'Steel'],
];

/** Built-in backgrounds: original CSS gradients (no artwork), so they cost nothing to store. */
export const PRESETS = {
  frost: { name: 'Frost Night', css: 'radial-gradient(1200px 500px at 70% -10%, rgba(120,150,190,.45), transparent 60%), radial-gradient(900px 600px at 10% 110%, rgba(90,110,140,.4), transparent 60%), linear-gradient(160deg, #2c3540 0%, #1d232b 45%, #161a20 100%)' },
  ember: { name: 'Emberfall', css: 'radial-gradient(900px 500px at 80% 0%, rgba(230,110,40,.45), transparent 60%), radial-gradient(800px 600px at 0% 100%, rgba(150,30,20,.5), transparent 60%), linear-gradient(160deg, #3a1f17 0%, #22130f 50%, #140b09 100%)' },
  forest: { name: 'Deepwood', css: 'radial-gradient(1000px 500px at 20% 0%, rgba(90,160,100,.4), transparent 60%), radial-gradient(900px 600px at 100% 100%, rgba(30,80,60,.55), transparent 60%), linear-gradient(160deg, #1f3026 0%, #142019 50%, #0c140f 100%)' },
  arcane: { name: 'Arcane Veil', css: 'radial-gradient(900px 500px at 75% 10%, rgba(150,90,230,.5), transparent 60%), radial-gradient(800px 600px at 10% 90%, rgba(60,80,200,.45), transparent 60%), linear-gradient(160deg, #241a3a 0%, #181229 50%, #0e0b18 100%)' },
  abyss: { name: 'Abyssal Sea', css: 'radial-gradient(1000px 500px at 50% -10%, rgba(40,160,190,.4), transparent 60%), radial-gradient(900px 600px at 90% 110%, rgba(10,60,110,.6), transparent 60%), linear-gradient(180deg, #12303a 0%, #0b1d28 50%, #060f16 100%)' },
  dusk: { name: 'Desert Dusk', css: 'radial-gradient(1100px 500px at 30% 0%, rgba(240,170,90,.45), transparent 60%), radial-gradient(900px 600px at 100% 100%, rgba(160,70,90,.45), transparent 60%), linear-gradient(170deg, #4a3226 0%, #2d1d1c 55%, #181012 100%)' },
  parchment: { name: 'Parchment', css: 'radial-gradient(1200px 600px at 50% 0%, rgba(255,250,235,.9), transparent 70%), radial-gradient(900px 700px at 0% 100%, rgba(200,170,120,.35), transparent 60%), linear-gradient(160deg, #efe4cc 0%, #e4d4b2 55%, #d6c29c 100%)' },
  slate: { name: 'Plain Slate', css: 'linear-gradient(180deg, #23272d, #1a1d22)' },
};

// ------------------------------------------------------------------ preferences for new characters
const DEFAULTS_KEY = 'qw.sheetDefaults.v1';
export function savedDefaults() { try { return JSON.parse(localStorage.getItem(DEFAULTS_KEY) || 'null'); } catch { return null; } }
function saveDefaults(a) { try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(a)); return true; } catch { return false; } }
/** The character's appearance merged over the defaults (handles older saves without one). */
export function appearanceOf(c) {
  const base = structuredClone(APPEARANCE_DEFAULT);
  const a = c.appearance || savedDefaults() || {};
  return { ...base, ...a, background: { ...base.background, ...(a.background || {}) } };
}

// ------------------------------------------------------------------ image storage
const DB = 'dnd-infinite'; const STORE = 'images';
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  return dbp;
}
const idb = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction(STORE, mode); const req = fn(tx.objectStore(STORE)); tx.oncomplete = () => res(req?.result); tx.onerror = () => rej(tx.error); }); };
const urlCache = new Map();
async function putImage(blob) {
  const id = `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try { await idb('readwrite', (s) => s.put(blob, id)); } catch {
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    localStorage.setItem(`qw.img.${id}`, data); // throws if storage is full; caller reports it
  }
  urlCache.set(id, URL.createObjectURL(blob));
  return id;
}
export async function imageURL(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  let url = null;
  try { const blob = await idb('readonly', (s) => s.get(id)); if (blob) url = URL.createObjectURL(blob); } catch { /* fall through */ }
  if (!url) { try { url = localStorage.getItem(`qw.img.${id}`); } catch { /* none */ } }
  if (url) urlCache.set(id, url);
  return url;
}
/** Every stored image as [id, data URL] pairs (for backups). */
export async function allImages() {
  const out = [];
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readonly'); const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => { const cur = req.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } };
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch { /* no IndexedDB: images live in localStorage and are backed up with it */ }
  const toURL = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return Promise.all(out.map(async ([id, v]) => [id, typeof v === 'string' ? v : await toURL(v)]));
}
/** Put an image back under its original id (restoring a backup). */
export async function restoreImage(id, dataURL) {
  const blob = await (await fetch(dataURL)).blob();
  try { await idb('readwrite', (s) => s.put(blob, id)); } catch { localStorage.setItem(`qw.img.${id}`, dataURL); }
  urlCache.delete(id);
}
export async function deleteImage(id) {
  if (!id) return;
  try { await idb('readwrite', (s) => s.delete(id)); } catch { /* ignore */ }
  try { localStorage.removeItem(`qw.img.${id}`); } catch { /* ignore */ }
  const u = urlCache.get(id); if (u?.startsWith('blob:')) URL.revokeObjectURL(u); urlCache.delete(id);
}

/** Read an image file, scale it to at most 2560 px on the long edge and re-encode it as JPEG. */
export async function processImage(file) {
  if (!/^image\//.test(file.type)) throw new Error('That file isn’t an image. Use a JPG, PNG or WebP.');
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The image couldn’t be read.')); i.src = src; });
    const w0 = img.naturalWidth; const h0 = img.naturalHeight;
    const k = Math.min(1, MAX_EDGE / Math.max(w0, h0));
    const w = Math.round(w0 * k); const hgt = Math.round(h0 * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hgt;
    cv.getContext('2d').drawImage(img, 0, 0, w, hgt);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.86));
    return { blob, info: { width: w0, height: h0, storedWidth: w, storedHeight: hgt, kb: Math.round(blob.size / 1024), name: file.name } };
  } finally { URL.revokeObjectURL(src); }
}

/** A word on how well an image will fill the sheet. */
export function qualityNote(info) {
  if (!info) return '';
  const { width: w, height: hh } = info; const ratio = w / hh;
  const notes = [];
  if (w < RECOMMENDED.min.width || hh < RECOMMENDED.min.height) notes.push(`It’s ${w} × ${hh}, smaller than ${RECOMMENDED.min.width} × ${RECOMMENDED.min.height}, so it may look soft on large screens. Adding a little blur hides that.`);
  if (ratio < 1.2) notes.push('It’s portrait or square, so the sides will be cropped; a landscape (16:9) image fits better.');
  return notes.length ? notes.join(' ') : `${w} × ${hh}: a good fit.`;
}

// ------------------------------------------------------------------ applying to the page
/** The frame colour as a hex, or null for the theme's neutral grey. */
export function frameColorOf(a, c) {
  const v = a.frameColor ?? 'class';
  if (v === 'neutral') return null;
  if (v === 'class') return tintOf(getClass(c.classId));
  return /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}
const hexToRgb = (hex) => { const m = String(hex).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); return m ? m.slice(1).map((x) => parseInt(x, 16)) : [197, 49, 49]; };

/** Apply a character's appearance to the sheet element (and the page behind it when fullPage is on). */
export function applyAppearance(el, c) {
  const a = appearanceOf(c); const bg = a.background;
  el.classList.toggle('ds-light', a.mode === 'light');
  el.classList.remove('frame-ornate', 'frame-simple', 'frame-none'); el.classList.add(`frame-${a.frame}`);
  el.classList.remove('text-small', 'text-normal', 'text-large'); el.classList.add(`text-${a.textSize}`);
  const [r, g, b] = hexToRgb(a.accent);
  el.style.setProperty('--ds-accent', a.accent);
  // Box frames: the class colour (as on the character card) unless the player picked another.
  const fc = frameColorOf(a, c);
  if (fc) { const [fr, fg, fb] = hexToRgb(fc); el.style.setProperty('--ds-frame', fc); el.style.setProperty('--ds-frame-soft', `rgba(${fr}, ${fg}, ${fb}, .45)`); }
  else { el.style.removeProperty('--ds-frame'); el.style.removeProperty('--ds-frame-soft'); }
  el.style.setProperty('--ds-accent-rgb', `${r}, ${g}, ${b}`);
  const op = Math.max(40, Math.min(100, a.panelOpacity)) / 100;
  el.style.setProperty('--ds-panel', a.mode === 'light' ? `rgba(255, 253, 248, ${op})` : `rgba(24, 28, 33, ${op})`);
  el.style.setProperty('--ds-bg-dim', String((bg.kind === 'image' ? bg.dim : Math.min(bg.dim, 20)) / 100));
  el.style.setProperty('--ds-bg-blur', `${bg.kind === 'image' ? bg.blur : 0}px`);
  el.style.setProperty('--ds-bg-pos', { top: 'center top', bottom: 'center bottom', left: 'left center', right: 'right center' }[bg.focus] || 'center');
  const page = document.body;
  page.classList.toggle('sheet-fullpage', !!a.fullPage);
  const set = (layer) => {
    el.style.setProperty('--ds-bg-layer', layer);
    if (a.fullPage) document.documentElement.style.setProperty('--page-bg-layer', layer); else document.documentElement.style.removeProperty('--page-bg-layer');
    for (const k of ['--ds-bg-dim', '--ds-bg-blur', '--ds-bg-pos']) document.documentElement.style.setProperty(k, el.style.getPropertyValue(k));
    document.documentElement.classList.toggle('page-light', a.mode === 'light');
  };
  if (bg.kind === 'none') set(a.mode === 'light' ? '#f3efe6' : '#1b1f24');
  else if (bg.kind === 'image' && bg.imageId) {
    const cached = urlCache.get(bg.imageId);
    set(cached ? `url("${cached}")` : PRESETS.slate.css);
    if (!cached) imageURL(bg.imageId).then((u) => { if (u && el.isConnected) set(`url("${u}")`); });
  } else set((PRESETS[bg.preset] || PRESETS.frost).css);
}
/** Called by the router when leaving the sheet. */
export function clearPageBackground() {
  document.body.classList.remove('sheet-fullpage');
  document.documentElement.style.removeProperty('--page-bg-layer');
  document.documentElement.classList.remove('page-light');
}

// ------------------------------------------------------------------ the Customize panel
export function customizeDialog(c, { save, sheetEl, listCharacters }) {
  const a = appearanceOf(c);
  const commit = () => { c.appearance = structuredClone(a); applyAppearance(sheetEl(), c); save(); };
  const body = h('div.customize');
  const seg = (opts, value, onPick) => h('div.seg', {}, opts.map(([v, l]) => h(`button${value === v ? '.on' : ''}`, { type: 'button', onclick: () => { onPick(v); commit(); draw(); } }, l)));
  const slider = (label, value, min, max, unit, onInput, hint) => h('label.cz-slider', {}, h('span', {}, label, h('b', {}, ` ${value}${unit}`)),
    h('input', { type: 'range', min, max, value, oninput: (e) => { onInput(Number(e.target.value)); e.target.previousSibling.lastChild.textContent = ` ${e.target.value}${unit}`; commit(); } }), hint ? h('small.muted', {}, hint) : null);

  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif', style: 'display:none', onchange: (e) => upload(e.target.files[0]) });
  const status = h('div.cz-status');
  async function upload(file) {
    if (!file) return;
    status.textContent = 'Processing image…';
    try {
      const { blob, info } = await processImage(file);
      const old = a.background.kind === 'image' ? a.background.imageId : null;
      const id = await putImage(blob);
      a.background = { ...a.background, kind: 'image', imageId: id, imageInfo: info };
      commit();
      // Remove the previous upload unless another character (or the saved default) still uses it.
      const inUse = (listCharacters?.() || []).some((x) => x.id !== c.id && x.appearance?.background?.imageId === old) || savedDefaults()?.background?.imageId === old;
      if (old && !inUse) deleteImage(old);
      toast('Background updated');
      draw();
    } catch (err) {
      status.textContent = /quota|storage/i.test(String(err)) ? 'Your browser’s storage is full, so the image couldn’t be saved. Try a smaller image.' : (err.message || 'Couldn’t use that image.');
    }
  }

  function draw() {
    const bg = a.background;
    const tiles = [
      ...Object.entries(PRESETS).map(([id, p]) => h(`button.cz-tile${bg.kind === 'preset' && bg.preset === id ? '.on' : ''}`, { type: 'button', title: p.name, style: `background:${p.css}`, onclick: () => { a.background = { ...bg, kind: 'preset', preset: id }; if (id === 'parchment' && a.mode === 'dark') a.mode = 'light'; commit(); draw(); } }, h('span', {}, p.name))),
      h(`button.cz-tile.none${bg.kind === 'none' ? '.on' : ''}`, { type: 'button', onclick: () => { a.background = { ...bg, kind: 'none' }; commit(); draw(); } }, h('span', {}, 'None')),
      h(`button.cz-tile.upload${bg.kind === 'image' ? '.on' : ''}`, { type: 'button', onclick: () => fileInput.click(), style: bg.kind === 'image' && urlCache.get(bg.imageId) ? `background-image:url("${urlCache.get(bg.imageId)}")` : '' }, h('span', {}, bg.kind === 'image' ? 'Your image · change' : '⇪ Upload image')),
    ];
    const drop = h('div.cz-drop', {
      ondragover: (e) => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files[0]); },
    },
    h('b', {}, 'Your own background'),
    h('p', {}, `Recommended: ${RECOMMENDED.width} × ${RECOMMENDED.height} px (16:9 landscape), JPG or WebP. At least ${RECOMMENDED.min.width} × ${RECOMMENDED.min.height} for a sharp result on large screens.`),
    h('p.muted.tiny', {}, 'The middle of the image sits behind the sheet’s panels, so pick art whose interesting parts are near the edges or top. Images are resized to 2,560 px wide and saved only in this browser (they aren’t included in exported character files).'),
    h('div.row', {}, h('button.btn.small', { type: 'button', onclick: () => fileInput.click() }, 'Choose image…'), h('span.muted.tiny', {}, ' or drop one here')),
    bg.kind === 'image' && bg.imageInfo ? h('p.cz-quality', {}, h('b', {}, bg.imageInfo.name || 'Your image'), ` — ${qualityNote(bg.imageInfo)}`) : null,
    status);

    body.replaceChildren(
      h('section', {}, h('h4', {}, 'Theme'),
        h('div.cz-row', {}, h('span', {}, 'Mode'), seg([['dark', '☾ Dark'], ['light', '☀ Light']], a.mode, (v) => { a.mode = v; })),
        h('div.cz-row', {}, h('span', {}, 'Accent colour'),
          h('div.swatches', {}, ACCENTS.map(([hex, name]) => h(`button.sw${a.accent.toLowerCase() === hex ? '.on' : ''}`, { type: 'button', title: name, style: `background:${hex}`, onclick: () => { a.accent = hex; commit(); draw(); } })),
            h('label.sw.custom', { title: 'Custom colour' }, h('input', { type: 'color', value: a.accent, oninput: (e) => { a.accent = e.target.value; commit(); } }))))),
      h('section', {}, h('h4', {}, 'Background'),
        h('div.cz-tiles', {}, tiles), drop,
        bg.kind === 'image' ? slider('Darken', bg.dim, 0, 85, '%', (v) => { a.background.dim = v; }, 'More darkening makes text easier to read over busy art.') : slider('Darken', bg.dim, 0, 20, '%', (v) => { a.background.dim = v; }),
        bg.kind === 'image' ? slider('Blur', bg.blur, 0, 16, ' px', (v) => { a.background.blur = v; }) : null,
        bg.kind === 'image' ? h('div.cz-row', {}, h('span', {}, 'Keep in view'), seg([['center', 'Centre'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], bg.focus, (v) => { a.background.focus = v; })) : null,
        h('label.cz-check', {}, h('input', { type: 'checkbox', checked: a.fullPage, onchange: (e) => { a.fullPage = e.target.checked; commit(); } }), ' Fill the whole page behind the sheet')),
      h('section', {}, h('h4', {}, 'Panels & text'),
        slider('Panel opacity', a.panelOpacity, 40, 100, '%', (v) => { a.panelOpacity = v; }, 'Lower it to let more of the background show through.'),
        h('div.cz-row', {}, h('span', {}, 'Frames'), seg([['ornate', 'Ornate'], ['simple', 'Simple'], ['none', 'None']], a.frame, (v) => { a.frame = v; })),
        h('div.cz-row', {}, h('span', {}, 'Frame colour'),
          h('div.swatches', {},
            h(`button.sw.sw-label${(a.frameColor ?? 'class') === 'class' ? '.on' : ''}`, { type: 'button', title: 'The character’s class colour, as on its card', style: `background:${tintOf(getClass(c.classId))}`, onclick: () => { a.frameColor = 'class'; commit(); draw(); } }, 'Class'),
            h(`button.sw.sw-label${a.frameColor === 'neutral' ? '.on' : ''}`, { type: 'button', title: 'Neutral grey', style: `background:${a.mode === 'light' ? '#8f8574' : '#8b939d'}`, onclick: () => { a.frameColor = 'neutral'; commit(); draw(); } }, 'Grey'),
            ACCENTS.map(([hex, name]) => h(`button.sw${String(a.frameColor).toLowerCase() === hex ? '.on' : ''}`, { type: 'button', title: name, style: `background:${hex}`, onclick: () => { a.frameColor = hex; commit(); draw(); } })),
            h('label.sw.custom', { title: 'Custom colour' }, h('input', { type: 'color', value: /^#/.test(a.frameColor || '') ? a.frameColor : tintOf(getClass(c.classId)), oninput: (e) => { a.frameColor = e.target.value; commit(); } })))),
        h('div.cz-row', {}, h('span', {}, 'Text size'), seg([['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']], a.textSize, (v) => { a.textSize = v; })),
        h('div.cz-row', {}, h('span', {}, 'Ability boxes'), seg([['modifiers', 'Modifier big'], ['scores', 'Score big']], c.settings.abilityDisplay === 'scores' ? 'scores' : 'modifiers', (v) => { c.settings.abilityDisplay = v; }))),
      fileInput);
  }
  draw();
  modal('Customize sheet', body, [
    { label: 'Reset to default', onClick: () => { Object.assign(a, structuredClone(APPEARANCE_DEFAULT)); commit(); draw(); return false; } },
    { label: 'Use for new characters', onClick: () => { toast(saveDefaults(structuredClone(a)) ? 'New characters will start with this look' : 'Couldn’t save the default'); return false; } },
    { label: 'Done', primary: true, onClick: () => { save(true); } },
  ]);
}
