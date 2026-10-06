// farm-daemon.js — ultra farming loop (ONE account, conservative by design).
// Each tick: status -> drip attempt (max 8/day) -> if newly funded, run funded
// lifecycle ONCE (fund -> preflight -> send -> report) -> daily REPORT.md.
// Free on-chain actions are NOT spammed (already have 4 txs); rotation only
// changes policy limit once/week max. Testnet-only guard built in.
// Usage: node scripts/farm-daemon.js [--once] [--intervalMs N]
// State: scripts/state.json (idempotency tokens persisted).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { guardedSend } from './policy-guard.js';
import { OWNER, BOT1 } from './farm-config.js';

const BIN = 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\m-aws.js';
const MCP = 'C:\\Users\\Nishis PC\\AppData\\Roaming\\npm\\node_modules\\@maroo-chain\\agent-wallet-kit\\dist\\bin\\maroo-mcp.js';
const STATE = new URL('./state.json', import.meta.url);
const DAY = 86400000;

function mcp(bin, tool, args = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['--unhandled-rejections=warn', bin, 'serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', id = 0; const pend = new Map();
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 90000);
    child.stdout.on('data', (d) => {
      buf += d.toString(); let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const m = JSON.parse(line);
          if (m.id !== undefined && pend.has(m.id)) { const f = pend.get(m.id); pend.delete(m.id); f(m); }
        } catch {}
      }
    });
    child.stderr.on('data', () => {});
    const req = (method, params) => new Promise((res) => {
      const i = ++id; pend.set(i, res);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
    });
    (async () => {
      try {
        await req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'farm-daemon', version: '2.0' } });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        const r = await req('tools/call', { name: tool, arguments: args });
        clearTimeout(timer); child.kill();
        resolve(JSON.parse(r.content[0].text));
      } catch (e) { clearTimeout(timer); child.kill(); reject(e); }
    })();
  });
}
const T = (t, a) => mcp(BIN, t, a);
const loadState = () => existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf-8')) : { dripDay: '', dripCount: 0, funded: false, lastReport: '' };
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));
const today = () => new Date().toISOString().slice(0, 10);

async function fundedLifecycle(log) {
  // Runs ONCE when owner balance first detected > 0. Caps: fund 100, send 10.
  const tok = Date.now().toString(36);
  const fund = await T('agent.fund', { agentId: BOT1, amount: '100', clientToken: `daemon-fund-${tok}` });
  log.push('fund: ' + JSON.stringify(fund).slice(0, 200));
  if (!fund.ok) return false;
  // Guarded send: fresh policy re-read, footgun checks, bound token (audit #16-21)
  const send = await guardedSend({ agentId: BOT1, amount: '10', to: OWNER, tag: `daemon-${tok}` });
  log.push('guardedSend: ' + JSON.stringify(send).slice(0, 300));
  return send.ok === true;
}

async function tick() {
  const st = loadState();
  if (st.dripDay !== today()) { st.dripDay = today(); st.dripCount = 0; }
  const log = [`## tick ${new Date().toISOString()}`];
  const owner = await T('agent.owner_balance').catch((e) => ({ ok: false, error: String(e).slice(0, 120) }));
  const bal = owner?.data?.balance ?? '0';
  log.push(`owner balance=${bal}`);
  if (bal !== '0' && !st.funded) {
    log.push('FUNDED DETECTED — running lifecycle');
    st.funded = await fundedLifecycle(log);
  } else if (!st.funded && st.dripCount < 8) {
    st.dripCount++;
    const drip = await T('faucet.drip', {}).catch((e) => ({ ok: false, error: String(e).slice(0, 120) }));
    const code = drip?.error?.code ?? (drip.ok ? 'OK' : JSON.stringify(drip).slice(0, 160));
    log.push(`drip #${st.dripCount}: ${code}`);
    if (drip.ok) log.push('DRIP SUCCESS — next tick runs lifecycle');
  } else {
    log.push('drip cap reached / already funded — monitor only');
  }
  if (st.lastReport !== today()) {
    st.lastReport = today();
    const agents = await T('agent.list').catch(() => ({ data: [] }));
    const lines = [`# Farm Report — ${today()}`, '', `Owner ${OWNER} balance=${bal} OKRW`, ''];
    for (const a of (agents?.data ?? [])) lines.push(`- ${a.name} ${a.address} ${a.status} onchain=${a.onchainAgentId}`);
    writeFileSync(new URL('../REPORT.md', import.meta.url), lines.join('\n') + '\n');
    log.push('REPORT.md written');
  }
  saveState(st);
  return log.join('\n');
}

const once = process.argv.includes('--once');
const intervalMs = Number(process.argv.find((a) => a.startsWith('--intervalMs='))?.split('=')[1] ?? 1800000);
console.log(await tick());
if (!once) {
  console.log(`[daemon] next tick in ${intervalMs}ms`);
  setInterval(async () => { try { console.log(await tick()); } catch (e) { console.log('[daemon] tick err ' + String(e).slice(0, 150)); } }, intervalMs);
}
