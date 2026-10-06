// tty-guard.js — proves prompt.js auto-YES under piped stdin (audit #35),
// then verifies the patched fail-closed behavior.
// Usage: node scripts/tty-guard.js
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ORIG = 'C:/Users/Nishis PC/AppData/Roaming/npm/node_modules/@maroo-chain/agent-wallet-kit/node_modules/@maroo-chain/m-aws/dist/cli/prompt.js';
const FIXED = './patches/fixed/prompt.js';
const probe = `import('__MOD__').then(async (p) => {
  const t = Date.now();
  const r = await p.confirm('WIPE EVERYTHING?', true).catch((e) => 'THREW:' + e.message);
  console.log(JSON.stringify({ result: r, ms: Date.now() - t, tty: !!process.stdin.isTTY }));
});`;

for (const [label, mod] of [['ORIGINAL', ORIG], ['PATCHED', resolve('patches/fixed/prompt.js')]]) {
  const url = label === 'ORIGINAL' ? 'file:///' + mod.replaceAll(' ', '%20') : pathToFileURL(mod).href;
  const r = spawnSync('node', ['--input-type=module', '-e', probe.replaceAll('__MOD__', url)], {
    encoding: 'utf-8', input: '', timeout: 20000, // stdin CLOSED pipe => isTTY false
  });
  console.log(label, '=>', (r.stdout || '').trim() || ('ERR ' + (r.stderr || '').slice(0, 120)));
}
console.log('\nExpected: ORIGINAL => true in ~0ms (auto-YES, no human). PATCHED => THREW (fail-closed).');
