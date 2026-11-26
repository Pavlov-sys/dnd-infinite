// Build a single self-contained HTML file (code, styles and all content packs inline) that works
// when opened straight from disk (file://), where browsers refuse to load separate module files.
//
//   bun tools/build-standalone.mjs        → infinity-codex.html
//
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'infinity-codex.html');

const result = await Bun.build({
  entrypoints: [join(root, 'js/main.js')], target: 'browser', format: 'esm', splitting: false, minify: true,
});
if (!result.success) { for (const m of result.logs) console.error(m); process.exit(1); }
const js = (await result.outputs.find((o) => o.kind === 'entry-point').text()).replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(root, 'css/app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');

let html = readFileSync(join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/app\.css">/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script type="module" src="js\/main\.js"><\/script>/, () => `<script type="module">\n${js}\n</script>`);
html = html.replace(/<script>\/\* file-warning \*\/[\s\S]*?<\/script>\s*/, ''); // the standalone file doesn't need the warning
if (!html.includes('<script type="module">\n')) throw new Error('index.html markers not found');
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1048576).toFixed(1)} MB)`);
