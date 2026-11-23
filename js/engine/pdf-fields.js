// Minimal PDF form-field reader: pulls every field name and value out of a fillable PDF,
// such as the character sheet D&D Beyond exports. No libraries; runs in browsers and Node 18+.
// Handles plain objects and compressed object streams (FlateDecode). Encrypted PDFs are refused.

const PDFDOC = { 0x80: '•', 0x81: '†', 0x82: '‡', 0x83: '…', 0x84: '—', 0x85: '–', 0x86: 'ƒ', 0x87: '⁄', 0x88: '‹', 0x89: '›', 0x8a: '−', 0x8b: '‰', 0x8c: '„', 0x8d: '“', 0x8e: '”', 0x8f: '‘', 0x90: '’', 0x91: '‚', 0x92: '™', 0x93: 'ﬁ', 0x94: 'ﬂ', 0x95: 'Ł', 0x96: 'Œ', 0x97: 'Š', 0x98: 'Ÿ', 0x99: 'Ž', 0x9a: 'ı', 0x9b: 'ł', 0x9c: 'œ', 0x9d: 'š', 0x9e: 'ž', 0xa0: '€' };

/** Turn the raw bytes of a PDF string into text (UTF-16BE with BOM, UTF-8 with BOM, or PDFDocEncoding). */
export function decodePdfString(bytes) {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(new Uint8Array(bytes.slice(3)));
  return bytes.map((b) => PDFDOC[b] || String.fromCharCode(b)).join('');
}

const isWs = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
const isDelim = (c) => '()<>[]{}/%'.includes(String.fromCharCode(c));

/** Tiny PDF object parser over a byte array. Returns JS values; references become {ref: n}. */
class Parser {
  constructor(bytes, pos = 0) { this.b = bytes; this.p = pos; }
  ws() { const b = this.b; for (;;) { while (this.p < b.length && isWs(b[this.p])) this.p++; if (b[this.p] === 37) { while (this.p < b.length && b[this.p] !== 10 && b[this.p] !== 13) this.p++; } else return; } }
  token() { const s = this.p; while (this.p < this.b.length && !isWs(this.b[this.p]) && !isDelim(this.b[this.p])) this.p++; return String.fromCharCode(...this.b.subarray(s, this.p)); }
  value(depth = 0) {
    if (depth > 64) throw new Error('PDF nesting too deep');
    this.ws();
    const b = this.b; const c = b[this.p];
    if (c === 40) return this.literal();
    if (c === 60 && b[this.p + 1] === 60) return this.dict(depth);
    if (c === 60) return this.hex();
    if (c === 91) { this.p++; const arr = []; for (;;) { this.ws(); if (b[this.p] === 93 || this.p >= b.length) { this.p++; return arr; } arr.push(this.value(depth + 1)); } }
    if (c === 47) { this.p++; return { name: this.token().replace(/#([0-9a-f]{2})/gi, (_, x) => String.fromCharCode(parseInt(x, 16))) }; }
    const t = this.token();
    if (!t) { this.p++; return null; }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) {
      // "n g R" is an indirect reference
      const save = this.p; this.ws(); const g = this.token(); this.ws();
      if (/^\d+$/.test(t) && /^\d+$/.test(g) && b[this.p] === 82 && (this.p + 1 >= b.length || isWs(b[this.p + 1]) || isDelim(b[this.p + 1]))) { this.p++; return { ref: Number(t) }; }
      this.p = save; return Number(t);
    }
    if (t === 'true') return true; if (t === 'false') return false; if (t === 'null') return null;
    return { op: t };
  }
  dict(depth) {
    this.p += 2; const out = {};
    for (;;) {
      this.ws();
      if (this.b[this.p] === 62 && this.b[this.p + 1] === 62) { this.p += 2; return out; }
      if (this.p >= this.b.length) return out;
      const k = this.value(depth + 1);
      if (!k || k.name === undefined) continue;
      out[k.name] = this.value(depth + 1);
    }
  }
  literal() {
    const b = this.b; this.p++; const out = []; let depth = 1;
    while (this.p < b.length) {
      const c = b[this.p++];
      if (c === 92) {
        const e = b[this.p++];
        const map = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12, 40: 40, 41: 41, 92: 92 };
        if (map[e] !== undefined) out.push(map[e]);
        else if (e >= 48 && e <= 55) { let o = e - 48; for (let i = 0; i < 2 && b[this.p] >= 48 && b[this.p] <= 55; i++) o = o * 8 + (b[this.p++] - 48); out.push(o & 255); }
        else if (e === 13) { if (b[this.p] === 10) this.p++; } else if (e !== 10) out.push(e);
      } else if (c === 40) { depth++; out.push(c); }
      else if (c === 41) { if (--depth === 0) break; out.push(c); }
      else out.push(c);
    }
    return { str: out };
  }
  hex() {
    this.p++; let s = '';
    while (this.p < this.b.length && this.b[this.p] !== 62) { const ch = String.fromCharCode(this.b[this.p++]); if (/[0-9a-f]/i.test(ch)) s += ch; }
    this.p++; if (s.length % 2) s += '0';
    const out = []; for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
    return { str: out };
  }
}

function indexOfBytes(bytes, needle, from = 0) {
  const n = [...needle].map((ch) => ch.charCodeAt(0));
  outer: for (let i = from; i <= bytes.length - n.length; i++) { for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer; return i; }
  return -1;
}

async function inflate(data) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed PDFs.');
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Find every "n g obj … endobj" in the file, including those packed inside object streams. */
async function readObjects(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  const objects = new Map(); const streams = [];
  const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length;
    try {
      const p = new Parser(bytes, start); const val = p.value();
      objects.set(Number(m[1]), val);
      if (val && typeof val === 'object' && !Array.isArray(val) && !val.str) {
        p.ws();
        if (text.startsWith('stream', p.p)) {
          let s = p.p + 6; if (bytes[s] === 13) s++; if (bytes[s] === 10) s++;
          const len = typeof val.Length === 'number' ? val.Length : -1;
          const end = len >= 0 && text.startsWith('endstream', s + len + (text[s + len] === '\r' || text[s + len] === '\n' ? 1 : 0)) ? s + len : text.indexOf('endstream', s);
          if (val.Type?.name === 'ObjStm') streams.push({ dict: val, data: bytes.subarray(s, end) });
          if (val.Type?.name === 'XRef' && val.Encrypt) objects.encrypted = true;
          re.lastIndex = Math.max(re.lastIndex, end);
        }
      }
    } catch { /* skip unreadable object */ }
  }
  if (/\/Encrypt\s/.test(text.slice(text.lastIndexOf('trailer') >= 0 ? text.lastIndexOf('trailer') : 0))) objects.encrypted = true;
  for (const st of streams) {
    try {
      const filter = [st.dict.Filter].flat().map((f) => f?.name);
      if (filter.some((f) => f && f !== 'FlateDecode')) continue;
      const data = filter.includes('FlateDecode') ? await inflate(st.data) : st.data;
      const head = new Parser(data); const pairs = [];
      for (let i = 0; i < st.dict.N; i++) { pairs.push([head.value(), head.value()]); }
      for (const [num, off] of pairs) {
        if (objects.has(num)) continue;
        try { objects.set(num, new Parser(data, st.dict.First + off).value()); } catch { /* skip */ }
      }
    } catch { /* skip unreadable stream */ }
  }
  return objects;
}

/**
 * Read all form fields. Returns { fields: {name: value}, count }.
 * Field values are strings; checkboxes give their export name (e.g. "Yes") or "" when off.
 */
export async function readPdfFields(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (indexOfBytes(bytes.subarray(0, 1024), '%PDF') < 0) throw new Error('This file is not a PDF.');
  const objects = await readObjects(bytes);
  if (objects.encrypted) throw new Error('This PDF is password-protected or encrypted, so its fields can’t be read.');
  const deref = (v, n = 0) => (v && v.ref !== undefined && n < 16 ? deref(objects.get(v.ref), n + 1) : v);
  const text = (v) => { v = deref(v); if (v == null) return ''; if (v.str) return decodePdfString(v.str); if (v.name !== undefined) return v.name === 'Off' ? '' : v.name; if (Array.isArray(v)) return v.map(text).join(', '); return String(v); };
  const fullName = (d, n = 0) => {
    const own = d.T !== undefined ? text(d.T) : '';
    const parent = deref(d.Parent);
    const up = parent && n < 16 ? fullName(parent, n + 1) : '';
    return [up, own].filter(Boolean).join('.');
  };
  const fields = {};
  for (const obj of objects.values()) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.str) continue;
    const isField = obj.T !== undefined || (obj.Subtype?.name === 'Widget' && obj.Parent);
    if (!isField) continue;
    const name = fullName(obj); if (!name) continue;
    let v = obj.V; if (v === undefined && obj.Parent) v = deref(obj.Parent)?.V;
    if (v === undefined && obj.AS) v = obj.AS;
    const value = text(v);
    if (!(name in fields) || (value && !fields[name])) fields[name] = value;
  }
  return { fields, count: Object.keys(fields).length };
}
