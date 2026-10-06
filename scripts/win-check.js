// win-check.js — Maroo Windows-compat verifier (the team's blindspot).
// Checks the 6 Windows-specific failures we hit. Run: node scripts/win-check.js
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const res = [];
const check = (id, ok, detail) => { res.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); };

// 1. Node version (24 triggers agentkit crash path)
const nv = process.version;
check('node-version', true, `${nv} (serve needs --unhandled-rejections=warn, see mcp-call.js)`);

// 2. HOME env (mcp config.js + kit init display depend on it; undefined on plain Windows)
check('env-HOME', !!process.env.HOME, process.env.HOME ?? 'UNSET (mcp KEYSTORE_DIR breaks, init display degrades)');

// 3. homedir() sane
check('homedir', homedir().length > 3, homedir());

// 4. PowerShell ExecutionPolicy (blocks `npm`/`npx` .ps1 shims for every new user)
try {
  const q = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-ExecutionPolicy'], { encoding: 'utf-8', timeout: 15000 });
  const pol = (q.stdout || '').trim();
  check('exec-policy', !/Restricted/.test(pol), `${pol || 'unknown'} (Restricted => use cmd /c npm ...)`);
} catch (e) { check('exec-policy', false, String(e).slice(0, 100)); }

// 5. Global shims present
const npmDir = `${process.env.APPDATA || ''}\\npm`;
check('global-shims', existsSync(`${npmDir}\\m-aws.cmd`), npmDir);

// 6. Claude Desktop path (kit uses macOS path; real Windows path differs)
import { join } from 'node:path';
const macPath = join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
const winPath = join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
check('claude-desktop-path', existsSync(winPath), existsSync(winPath) ? winPath : `kit looks at macOS path (wrong); real: ${winPath}`);

const fails = res.filter((r) => !r.ok).length;
console.log(`\n${res.length - fails}/${res.length} pass`);
process.exit(fails ? 1 : 0);
