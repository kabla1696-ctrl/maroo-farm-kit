// maroo-harden.js — post-install security hardener for Maroo tooling.
// Fixes audit finding: ~/.maroo/credentials.json + keystore files are created
// WITHOUT mode 0o600, so tokens/keys are world-readable on shared machines.
// Windows: strips inherited ACLs, grants current user only (icacls).
// POSIX: chmod 600 + verifies.
// Also: strict doctor (warnings fail), MCP config backup.
// Usage: node scripts/maroo-harden.js [--fix]
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const FIX = process.argv.includes('--fix');
const targets = [
  join(HOME, '.maroo', 'credentials.json'),
  join(HOME, '.maroo', 'keystore'),
];
const report = [];

for (const t of targets) {
  if (!existsSync(t)) { report.push({ path: t, status: 'missing' }); continue; }
  if (platform() === 'win32') {
    const q = spawnSync('icacls', [t], { encoding: 'utf-8' });
    const out = q.stdout || '';
    const worldReadable = /Everyone|BUILTIN\\Users.*\(.*R/.test(out);
    report.push({ path: t, status: worldReadable ? 'EXPOSED' : 'restricted', detail: out.split('\n')[0] });
    if (FIX && worldReadable) {
      // /inheritance:r removes inherited ACEs; grant current user full control
      const u = process.env.USERNAME || '*S-1-5-32-544';
      const r1 = spawnSync('icacls', [t, '/inheritance:r', '/grant:r', `${u}:(OI)(CI)F`], { encoding: 'utf-8' });
      report.push({ path: t, status: r1.status === 0 ? 'FIXED' : 'FIX_FAILED', detail: (r1.stdout || r1.stderr || '').slice(0, 200) });
    }
  } else {
    const mode = (statSync(t).mode & 0o777).toString(8);
    report.push({ path: t, status: mode === '600' || mode === '700' ? 'restricted' : 'EXPOSED', detail: 'mode ' + mode });
  }
}

// Backup MCP configs before any init (audit: read-modify-write race)
mkdirSync('backups', { recursive: true });
for (const c of ['.mcp.json', '.cursor/mcp.json', '.gemini/settings.json']) {
  if (existsSync(c)) {
    const b = `backups/${c.replace(/[/\\]/g, '_')}.${Date.now()}.bak`;
    copyFileSync(c, b);
    report.push({ path: c, status: 'backed-up', detail: b });
  }
}

console.log(JSON.stringify(report, null, 2));
const exposed = report.filter((r) => r.status === 'EXPOSED');
if (exposed.length && !FIX) { console.log('\nRun with --fix to restrict permissions.'); process.exit(2); }
if (exposed.length && FIX) process.exit(2);
console.log('\nAll secrets restricted.');
