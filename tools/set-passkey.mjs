// Usage: node tools/set-passkey.mjs <new passkey>
// Writes the passkey's hash into js/gate.js. Everyone has to enter the new passkey once.
import { readFileSync, writeFileSync } from 'node:fs';
import { passHash } from '../js/gate.js';
const pass = process.argv.slice(2).join(' ').trim();
if (!pass) { console.error('Usage: node tools/set-passkey.mjs <new passkey>'); process.exit(1); }
const file = new URL('../js/gate.js', import.meta.url);
const src = readFileSync(file, 'utf8').replace(/export const PASS_HASH = '[0-9a-f]*';/, `export const PASS_HASH = '${passHash(pass)}';`);
writeFileSync(file, src);
console.log('Passkey updated. Rebuild (bun tools/build-standalone.mjs) and push.');
